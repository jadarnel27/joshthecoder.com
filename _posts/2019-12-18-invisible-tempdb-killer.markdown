---
layout: post
title:  "Invisible tempdb Killer"
categories: 
tags: 
---

Let's say you are informed that tempdb is getting hammered on a production SQL Server instance (in the "lots of reads and writes" sense, not the "lots of shots of tequila" sense), and it's disrupting other workloads on the system.  You may have found this out through the power of monitoring (tempdb files are growing or full), or your favorite DMV queries, or just from being really smart.

## Who, Exactly, Is Active Around Here?

You spring into action to find the offending query, and run `EXEC sp_WhoIsActive` but get...nothin':

[![screenshot of empty resultset from sp_whoisactive][1]][1]

Oh, maybe the session is sleeping?  You try `EXEC sp_WhoIsActive @show_sleeping_spids = 2` but get...more nothin' (no, you don't get another screenshot of the same empty resultset).

## Is There A Session Though

I mean, something has to be doing this right?  You query `sys.dm_exec_sessions`:

    SELECT 
        session_id, 
        login_time, 
        [program_name], 
        client_interface_name, 
        [status], 
        cpu_time, 
        memory_usage, 
        reads, 
        writes, 
        logical_reads
    FROM sys.dm_exec_sessions

And find this, uh, suspicious session coming from an application called "LargeObjectParamTest":

[![screenshot of sys.dm_exec_sessions results showing a running session][2]][2]

...okay, maybe it won't be this obvious in real life.  But bear with me.  Also maybe that spoiled the surprise.  Anyway.

It seems weird that this user (non-system) session is in the "running" state but not showing up in the `sp_WhoIsActive` results.  Since you know tempdb is involved, you go to check out this DMV you may or may not have just heard of today:

    SELECT * 
    FROM sys.dm_db_task_space_usage tsu 
    WHERE tsu.session_id = 53;

And here you see that this session is allocating "internal" objects in the tempdb database:

[![screenshot of sys.dm_db_task_space_usage results showing tempdb allocations][3]][3]

So far it's allocated 69,816 pages (that's around 545 MB).  If you keep refreshing that query it eventually caps out at 133,824 pages (a little over 1 GB):

[![screenshot of sys.dm_db_task_space_usage results showing more tempdb allocations][4]][4]

## Magically Active

The moment those tempdb allocations stop piling up, a query for this session finally shows up in `sp_WhoIsActive`:

[![screenshot of whoisactive results showing the running query][5]][5]

Of interest is that the tempdb usage *starts* at 133,824 even though the query has just shown up in the results (in fact, that DMV is one of the places `sp_WhoIsActive` pulls tempdb allocation information from).

The query text reads:

    INSERT INTO dbo.BigColumn (ForU) VALUES (@forU)

Taking a look at that table definition, the `ForU` column is a `nvarchar(max)` data type.

## The application

Here's the code that caused this unfortunate situation:

    var oneGigString = new string('a', 536870912);

    using var connection = new SqlConnection(
        @"Data Source=.\SQL2017;Database=LargeObjectTest;Integrated Security=SSPI;Application Name=LargeObjectParamTest");
    using var command = new SqlCommand(
        "INSERT INTO dbo.BigColumn (ForU) VALUES (@forU)", connection);

    var forU = command.Parameters.Add("@forU", SqlDbType.NVarChar, int.MaxValue);
    forU.Value = oneGigString;

    connection.Open();
    command.ExecuteNonQuery();
    connection.Close();

The code creates a unicode string of half a billion "a"s, then inserts that into the `nvarchar(max)` column.  At two bytes per character for the `nvarchar` data type, this results in needing 1 GB of storage.

Because this is being passed as a parameter, SQL Server will use tempdb to temporarily store the data, per [the documentation of the above mentioned DMV][6] (**emphasis** is mine):

> Internal objects are only in tempdb. The following objects are included in the internal object page counters:  
> - Work tables for cursor or spool operations and **temporary large object (LOB) storage**
> - Work files for operations such as a hash join
> - Sort runs

Before the *insert* query ever starts running, but after the connection (session) is established, the SQL Server driver for .NET streams the large object parameter value up to the tempdb database of the SQL Server instance.

## In Real Life

Hopefully no one is doing...exactly this?  But if you're doing something more realistic with LOB data in SQL Server (JSON, XML, file uploads, arbitrary large text like blog posts, etc), then it helps to be aware of the way this works, and where / how you can see those tempdb allocations happening.

By the way, I should clarify that this isn't a criticism of `sp_WhoIsActive`.  I love that procedure and use it all the time.  For all I know there's a really good reason not to show results like this (for instance, there's no actual *query* running during the period where the LOB parameter is being uploaded to tempdb).

[1]: {{ site.url }}/assets/2019-12-18-whoisactive-no-results.png
[2]: {{ site.url }}/assets/2019-12-18-running-session.png
[3]: {{ site.url }}/assets/2019-12-18-tempdb-usage.png
[4]: {{ site.url }}/assets/2019-12-18-tempdb-usage-final.png
[5]: {{ site.url }}/assets/2019-12-18-whoisactive-results.png
[6]: https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-db-task-space-usage-transact-sql?view=sql-server-ver15