---
layout: post
title:  "Version Store Usage for ONLINE Column Operations"
categories: 
tags: 
---

In SQL Server 2016, the `WITH (ONLINE = ON)` option was added to `ALTER TABLE...ALTER COLUMN` statements.  [The documentation][1] states the purpose of this pretty nicely:

> Allows many alter column actions to be carried out while the table remains available. Default is OFF. You can run alter column online for column changes related to data type, column length or precision, nullability, sparseness, and collation.

I've seen several blog posts out there that talk about how `ONLINE` operations like this take longer, which is one of the tradeoffs you make to keep the table online.  

But what happens when you *update* the values in the column being altered?  As it turns out, the `tempdb` version store is used to store the new values until the operation completes - in the same way as if you were using the `SNAPSHOT` isolation level.

Most interesting of all (to me, anyway), this happens even if the database option `ALLOW_SNAPSHOT_ISOLATION` is set to `OFF`.

## The Inciting Incident

I was reading a question on Database Administrators Stack Exchange: [60GB in version store in short amount of time, allow snapshot isolation is disabled][2]

As I speculated about what might cause this inexplicable version store growth, the first thing that [came to mind][3] was Availability Group "readable secondaries."  Queries against readable secondaries use `SNAPSHOT` isolation regardless of the requested isolation level, which can lead to quick version store growth on systems with high throughput (or long-running transactions) on the primary.

My guess was wrong in this case (the only AG on this instance was acting as the primary node at the time of the incident).

Then [Joe Obbish][4] pointed out to me that `ONLINE` column operations might also use the version store in this way, so I set out to test it.

## The Setup

I'm using the 2010 version of the Stack Overflow database, running on SQL Server 2017 CU15.  I've turned off both of the `SNAPSHOT`-related settings in the database:

[![Screenshot of query and results showing snapshot is off in this database][5]][5]

## Altering and Faltering

Here's the `ONLINE` column operation.  Don't try to act like turning an `int` into a `varchar(8)` is the weirdest thing you've seen in a database:

    ALTER TABLE dbo.Votes 
    ALTER COLUMN PostId varchar(8) NOT NULL 
    WITH (ONLINE = ON);

The votes table has about 10 million rows in it, so this takes a bit of time (10-15 seconds if nothing else is happening).  If I check `sys.dm_tran_version_store_space_usage` and `sp_WhoIsActive`, I can see that:

- the version store is not growing, and
- the `ALTER` statement is chugging along making progress

[![Screenshot of query and results showing alter is running and version store is empty][6]][6]

While that's running, I'm going to open a second session and update all 10 million rows in the table, and then roll it all back:

    BEGIN TRANSACTION;

    UPDATE dbo.Votes
    SET PostId = 1;

    ROLLBACK TRANSACTION;

Here are the results of the monitoring queries after a couple of *minutes* of both sessions running:

[![Screenshot of query and results showing high version store usage and progress of both queries][7]][7]

As you can see, the update resulted in 184 MB of version store usage.

On a side note, in this screenshot the `ALTER` operation has basically finished doing its work, but it needs a SCH-M lock in order to replace the existing column with the new copy of the column.  You can see this as `LCK_M_SCH_M` wait reported in the `wait_info` column.  This clears up once the `UPDATE` completes.

## SNAPSHOT-esque

Just to really drive the point home about users not being able to use `SNAPSHOT` directly, trying to set that isolation level:

    SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
    BEGIN TRANSACTION;

    UPDATE dbo.Votes
    SET PostId = 1;

Results in the expected error message:

> Msg 3952, Level 16, State 1, Line 5  
> Snapshot isolation transaction failed accessing database 'StackOverflow2010' because snapshot isolation is not allowed in this database. Use ALTER DATABASE to allow snapshot isolation.

## Takeaways

If you're seeing unexpected version store activity in `tempdb` on SQL Server 2016 or higher, look out for any `ALTER COLUMN` statements with the `ONLINE = ON` option enabled.

And if you have any ideas on what might be going on with Tony's server, feel free to leave a comment here - or add an answer on [the Stack Exchange post][2]!

[1]: https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-table-transact-sql?view=sql-server-2017
[2]: https://dba.stackexchange.com/q/248888/6141
[3]: https://dba.stackexchange.com/a/248901/6141
[4]: https://erikdarlingdata.com/author/joe-obbish/
[5]: {{ site.url }}/assets/2019-09-17-snapshot-settings.PNG
[6]: {{ site.url }}/assets/2019-09-17-alter-progress.PNG
[7]: {{ site.url }}/assets/2019-09-17-version-store-usage.PNG