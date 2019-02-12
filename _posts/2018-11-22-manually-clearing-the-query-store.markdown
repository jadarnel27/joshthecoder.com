---
layout: post
title:  "Manually Clearing the Query Store"
categories: 
---
I came across some interesting information about manually clearing the Query Store while looking into a [question on Database Administrators Stack Exchange][1], and thought it might be worth documenting here on the blog as well.

## Clearing the Query Store

[According to Microsoft Docs][2], we can clear the Query Store data in a user database by running this command:

    ALTER DATABASE [YourDatabaseName] SET QUERY_STORE CLEAR;

The docs page says this about the clear option:

> CLEAR  
> Remove the contents of the query store.

That page also shows an optional "ALL" parameter, but is strangely silent about what that does.

I was hoping that I could use Extended Events to capture any queries being executed during this process to see what's going on.

## The XE session

SSMS has several Extended Event session templates, and I decided to use the "Query Detail Tracking" one, as it captures all the major "query finished" related events.  

As it turns out, all the important stuff in this case comes through in the sp_statement_completed event, so this session definition is sufficient to capture what's happening:

    CREATE EVENT SESSION [all_queries] ON SERVER 
    ADD EVENT sqlserver.sp_statement_completed(SET collect_object_name=(1)
        ACTION(sqlserver.client_app_name,sqlserver.database_id,sqlserver.query_hash,sqlserver.query_plan_hash,sqlserver.session_id)
        WHERE ([package0].[greater_than_uint64]([sqlserver].[database_id],(4)) AND [package0].[equal_boolean]([sqlserver].[is_system],(0))))
    ADD TARGET package0.ring_buffer
    WITH (MAX_MEMORY=4096 KB,EVENT_RETENTION_MODE=ALLOW_SINGLE_EVENT_LOSS,MAX_DISPATCH_LATENCY=30 SECONDS,MAX_EVENT_SIZE=0 KB,MEMORY_PARTITION_MODE=NONE,TRACK_CAUSALITY=ON,STARTUP_STATE=OFF)
    GO

## Running the test

After creating and starting the XE session, I ran the statement we've been discussing, and my session picked up 5 queries:

    TRUNCATE table sys.plan_persist_runtime_stats;
    TRUNCATE table sys.plan_persist_runtime_stats_interval;
    TRUNCATE table sys.plan_persist_plan;
    TRUNCATE table sys.plan_persist_query;
    TRUNCATE table sys.plan_persist_query_text;

Adding the optional "ALL" parameter after "CLEAR" caused this additional statement to show up:

    TRUNCATE table sys.plan_persist_context_settings;

## What does it all mean

Presumably those are the base tables that underlie the [Query Store catalog views][3].  Thus, as the MS Docs very tersely explained, all of the data collected by the Query Store is deleted when you run this command.

In the case of the Stack Exchange question mentioned at the beginning of this post, the use of TRUNCATE (vs DELETE) under the covers explains why their Query Store-related identity fields were being "reseeded," since `TRUNCATE TABLE` [resets identity values:][4]

> If the table contains an identity column, the counter for that column is reset to the seed value defined for the column.

Regarding the extra query run by the "ALL" command, I'm guessing the number of distinct context settings in a given environment is usually pretty small (as a given client generally uses the same context settings each time), so Microsoft opted to leave them as a minor performance optimization.  But that's just a guess.

## Other ways to trim the Query Store

The MS Docs article [Best Practice with the Query Store][5] has a section on this titled "*Keep the most relevant data in Query Store.*"  Rather than manually clearing all the data, there are two main options trimming the data here.

The first is setting the time-based automatic cleanup option, which runs once every 24 hours and removes query data older than a set threshold:

    ALTER DATABASE [YourDatabaseName]
    SET QUERY_STORE (CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30));

The second is setting the size-based automatic cleanup option, which runs when the configured maximum size is (nearly) reached:

    ALTER DATABASE [YourDatabaseName]
    SET QUERY_STORE (SIZE_BASED_CLEANUP_MODE = AUTO);

    ALTER DATABASE [YourDatabaseName]
    SET QUERY_STORE (MAX_STORAGE_SIZE_MB = 1024);  

You can have both of these set of you want.  In both cases, they delete the oldest queries first.

The difference in these cleanup processes is that they use delete rather than truncate, so identity values won't be reset.  If you happen to capture this process in action, you'll see a bunch of queries like this:

    DELETE sys.plan_persist_runtime_stats WHERE plan_id IN (-- etc, you get it)

## Changes in SQL Server 2017

All the testing above was done on SQL Server 2016.  While writing this, I was reminded that [wait stats were added to the Query Store in 2017:][6]

> Starting today in Azure SQL Database and from CTP 2.0 of SQL Server 2017 wait stats per query are available in Query Store.

This added an additional catalog view called `sys.query_store_wait_stats`.  Running `QUERY_STORE CLEAR [ALL]` on a 2017 instance executes one more truncate statement:

    TRUNCATE table sys.plan_persist_wait_stats;

## Summary

Clearing the Query Store uses TRUNCATE and will thus reset the identity fields on those underlying tables.  You're probably better off using the automatic time or size-based cleanup options.  I hope you all found this little curiosity interesting as well!

[1]: https://dba.stackexchange.com/questions/223090/dont-reseed-tables-on-query-store-clean
[2]: https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-database-transact-sql-set-options?view=sql-server-2017
[3]: https://docs.microsoft.com/en-us/sql/relational-databases/system-catalog-views/query-store-catalog-views-transact-sql?view=sql-server-2017
[4]: https://docs.microsoft.com/en-us/sql/t-sql/statements/truncate-table-transact-sql?view=sql-server-2017
[5]: https://docs.microsoft.com/en-us/sql/relational-databases/performance/best-practice-with-the-query-store?view=sql-server-2017#keep-the-most-relevant-data-in-query-store
[6]: https://blogs.msdn.microsoft.com/sqlserverstorageengine/2017/07/03/what-are-you-waiting-for-introducing-wait-stats-support-in-query-store/