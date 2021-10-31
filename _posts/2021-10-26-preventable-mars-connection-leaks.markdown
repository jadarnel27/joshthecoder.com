---
layout: post
title:  "Preventable MARS Connection Leaks"
categories: 
tags: 
---

I recently looked at a SQL Server instance that had a large number of MARS connections under a single "parent" connection.  Most of these "child" connections had been idle for quite a while, but they were still hanging around.

## Background - Reading Data Normally

First, some context.

Normally, when you connect to SQL Server using the .NET SqlClient driver, you can only have one command running against that connection at a time.

Imagine I need 10 users and 10 posts from the Stack Overflow database.  I can run those queries sequentially like this:

    var connectionString = @"Server=.\SQL2019;Database=StackOverflow201812;Trusted_Connection=True;Application Name=MARS Test";

    var connection = new SqlConnection(connectionString);
    connection.Open();

    using (var command1 = new SqlCommand("SELECT TOP (10) Id FROM dbo.Users", connection))
    using (var command2 = new SqlCommand("SELECT TOP (10) Id FROM dbo.Posts", connection))
    {
        var reader1 = command1.ExecuteReader();
        while (reader1.Read())
        {
            Console.WriteLine($"Found User Id {reader1.GetInt32(0)}");
        }
        reader1.Close();

        var reader2 = command2.ExecuteReader();
        while (reader2.Read())
        {
            Console.WriteLine($"Found Post Id {reader2.GetInt32(0)}");
        }
        reader2.Close();
    }

But what if I want to run both queries at once?  I could try to send both queries to the server, and then read their results sequentially, like this:

    var reader1 = command1.ExecuteReader();
    var reader2 = command2.ExecuteReader();

    while (reader1.Read())
    {
        Console.WriteLine($"Found User Id {reader1.GetInt32(0)}");
    }

    while (reader2.Read())
    {
        Console.WriteLine($"Found Post Id {reader2.GetInt32(0)}");
    }

However, that code will throw an exception when I try to run the second query (`command2.ExecuteReader()`):

> There is already an open DataReader associated with this Command which must be closed first.

## MARS Has Entered The Chat

A "quick fix" for this issue would be to enable the "multiple active result sets" feature via this connection string option:

    MultipleActiveResultSets=True

Changing that connection string makes the error above magically go away!

When I run the first code sample (with sequential queries), this is what I see on the server in terms of connections:

    SELECT 
        c.connect_time,
        c.connection_id,
        c.parent_connection_id,
        s.[program_name]
    FROM sys.dm_exec_connections c
    INNER JOIN sys.dm_exec_sessions s
        ON s.session_id = c.session_id
    WHERE
        s.[program_name] = 'MARS Test'
    ORDER BY c.connect_time;

[![Screenshot of SSMS query results showing one connection][1]][1]

There's just one connection.

When I run the MARS-enabled code sample (with overlapping queries), the same DMV query shows this:

[![Screenshot of SSMS query results showing four connections][2]][2]

Now we have four connections.  Two connections are established right away (the parent, and the initial child).

The other two get created as each `ExecuteReader()` call is run.

## How Do We Get Rid Of Them?

So what might cause these "MARS connections" to accumulate and not get cleaned up?

You might have noticed that in my code sample with the overlapping queries, I read all the results from the `SqlDataReader` objects, but **I never closed them.**

Without MARS enabled, you have the helpful error message to remind you to close / dispose the readers.

With MARS enabled, the SqlClient driver will happily let you keep opening more and more readers, without ever closing them.

The app where I saw this issue is using kind of an unusual coding pattern, in that it maintains a single `SqlConnection` object and reuses that throughout the application. This wouldn't be a problem normally (although it's more efficient to simply rely on the built-in connection pooling mechanism), but this app also had MARS enabled, and wasn't calling `Close()` or `Dispose()` on the readers being opened.

The situation gets gradually worse and worse as more readers are opened, and abandoned, without being cleaned up:

[![Screenshot of SSMS query results showing many connection][5]][5]

The connections *do* get cleaned up if you call `Close()` or `Dispose()` on the readers.

Child connections created by using the `ExecuteScalar()` or `ExecuteNonQuery()` APIs appear to get cleaned up on their own.  

Still, a better solution is to allow the `SqlConnection` to be reset and returned to the pool periodically.

## Consequences

As some readers may know, SQL Server allows [a maximum of 32,767 connections][3].  If I let my little test app run in a loop until I have some between 32,767 and 34,000 connections, I eventually get this error message and all the connections are dumped by the driver:

> System.Data.SqlClient.SqlException: 'A transport-level error has occurred when receiving results from the server. (provider: Session Provider, error: 19 - Physical connection is not usable)'
>   at System.Data.SqlClient.SqlConnection.OnError(SqlException exception, Boolean breakConnection, Action`1 wrapCloseInAction)
>   at System.Data.SqlClient.SqlInternalConnection.OnError(SqlException exception, Boolean breakConnection, Action`1 wrapCloseInAction)
>   at System.Data.SqlClient.TdsParser.ThrowExceptionAndWarning(TdsParserStateObject stateObj, Boolean callerHasConnectionLock, Boolean asyncClose)
>   at System.Data.SqlClient.TdsParserStateObject.ReadSniError(TdsParserStateObject stateObj, UInt32 error)
>   at System.Data.SqlClient.TdsParserStateObject.ReadSniSyncOverAsync()
>   at System.Data.SqlClient.TdsParserStateObject.TryReadNetworkPacket()
>   at System.Data.SqlClient.TdsParserStateObject.TryPrepareBuffer()
>   at System.Data.SqlClient.TdsParserStateObject.TryReadByte(Byte& value)
>   at System.Data.SqlClient.TdsParser.TryRun(RunBehavior runBehavior, SqlCommand cmdHandler, SqlDataReader dataStream, BulkCopySimpleResultSet bulkCopyHandler, TdsParserStateObject stateObj, Boolean& dataReady)
>   at System.Data.SqlClient.SqlDataReader.TryConsumeMetaData()
>   at System.Data.SqlClient.SqlDataReader.get_MetaData()
>   at System.Data.SqlClient.SqlCommand.FinishExecuteReader(SqlDataReader ds, RunBehavior runBehavior, String resetOptionsString, Boolean isInternal, Boolean forDescribeParameterEncryption, Boolean shouldCacheForAlwaysEncrypted)
>   at System.Data.SqlClient.SqlCommand.RunExecuteReaderTds(CommandBehavior cmdBehavior, RunBehavior runBehavior, Boolean returnStream, Boolean async, Int32 timeout, Task& task, Boolean asyncWrite, Boolean inRetry, SqlDataReader ds, Boolean describeParameterEncryptionRequest)
>   at System.Data.SqlClient.SqlCommand.RunExecuteReader(CommandBehavior cmdBehavior, RunBehavior runBehavior, Boolean returnStream, String method, TaskCompletionSource`1 completion, Int32 timeout, Task& task, Boolean& usedCache, Boolean asyncWrite, Boolean inRetry)
>   at System.Data.SqlClient.SqlCommand.RunExecuteReader(CommandBehavior cmdBehavior, RunBehavior runBehavior, Boolean returnStream, String method)
>   at System.Data.SqlClient.SqlCommand.ExecuteReader(CommandBehavior behavior, String method)
>   at System.Data.SqlClient.SqlCommand.ExecuteReader()
>   at MarsTest.Program.Main(String[] args) in C:\Code\MarsTest\MarsTest\Program.cs:line 25

Incidentally, not properly cleaning up the reader objects is also causing a memory leak in the .NET application:

[![Screenshot of Visual Studio showing increasing memory usage][4]][4]

## Conclusions

It's always best to call `Dispose()` on objects that implement `IDisposable`, and that includes `SqlDataReader`, `SqlCommand`, and `SqlConnection`.

Be especially careful to do so when using the MARS feature.

Also, generally speaking, the built-in connection pooling built into SqlClient is your friend. Don't try to build your own connection pooling.

[1]: {{ site.url }}/assets/2021-10-26-query-results-1-connection.png
[2]: {{ site.url }}/assets/2021-10-26-mars-query-results-4-connections.png
[3]: https://docs.microsoft.com/en-us/sql/database-engine/configure-windows/configure-the-user-connections-server-configuration-option?view=sql-server-ver15
[4]: {{ site.url }}/assets/2021-10-26-visual-studio-memory-leak.png
[5]: {{ site.url }}/assets/2021-10-26-mars-query-results-many-connections.png