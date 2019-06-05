---
layout: post
title:  "Transactions Don't Start At BEGIN TRAN"
categories: 
tags: 
---

I was a fly on the wall recently while some folks were troubleshooting a stored procedure, and one them made the statement that "transactions don't start until you do something that needs a transaction."  I had never heard this before, and thought it was interesting.  Intuitively, I would expect a transaction to begin as soon as the `BEGIN TRAN` statement is executed.

## Documentation

As it turns out, my intuition was wrong (shocking, I know 😜).  The [documentation for `BEGIN TRANSACTION`][1] starts out like this:

> Marks the starting point of an explicit, local transaction. Explicit transactions start with the BEGIN TRANSACTION statement and end with the COMMIT or ROLLBACK statement.

Of course, no one reads the documentation.  And even if they do, they certainly don't continue on to the 4th paragraph of the "General Remarks" section.  That's like going to the [second page of Google search results][2].

If one did trudge on through the docs, they would find this gem:

> Although BEGIN TRANSACTION starts a local transaction, it is not recorded in the transaction log until the application subsequently performs an action that must be recorded in the log, such as executing an INSERT, UPDATE, or DELETE statement. An application can perform actions such as acquiring locks to protect the transaction isolation level of SELECT statements, but nothing is recorded in the log until the application performs a modification action.

Well that's interesting!  Let's check it out.

## Into The Log File

I have created a database on my local SQL Server 2017 instance, and it's using the SIMPLE recovery model.  The script below performs a `CHECKPOINT` (to clear the log file), then runs a non-modification query in a transaction.  I'm also checking the contents of the file before and after the "transaction."

    CHECKPOINT;

    SELECT
        l.[Current LSN],
        l.Operation,
        l.Context
    FROM sys.fn_dblog(NULL, NULL) AS l;

    BEGIN TRANSACTION;

    SELECT 'Hello, Randall' AS MoreXkcdReferences;

    COMMIT TRANSACTION;

    SELECT
        l.[Current LSN],
        l.Operation,
        l.Context
    FROM sys.fn_dblog(NULL, NULL) AS l;

The only log records shown are those documenting the `CHECKPOINT` operation:

[![screenshot of query results showing the transaction wasn't logged][3]][3]

This goes against my "intuition" where I originally thought that we would see `LOP_BEGIN_XACT` and `LOP_COMMIT_XACT` records.

To show what I mean, here's a transaction that actually does something that *requires* a transaction:

    BEGIN TRANSACTION;

    CREATE TABLE BeretGuy
    (
        Id int NOT NULL,
        Antic varchar(50) NOT NULL
    );

    COMMIT TRANSACTION;

    SELECT
        l.[Current LSN],
        l.Operation,
        l.Context
    FROM sys.fn_dblog(NULL, NULL) AS l;

Now, in addition to the existing 3 log records for the `CHECKPOINT`, there are 25 more for the transaction and table creation - including the two I mentioned above:

[![screenshot of query results showing the transaction was logged][4]][4]

As an aside, you might be wondering why there are so many insert and modify operations logged, including some against clustered tables (considering all I did was create a heap).  Almost all of these entries in the log are related to the database metadata system tables that keep track of information about tables, columns, etc.  DDL statements do a lot more than they look like on the surface (something I've [been burned by before][6])!

## Why It Matters

In practice, you could see some confusing errors due to this behavior.

Since this demo requires the `SNAPSHOT` isolation level, I'll enable that:

    ALTER DATABASE [IntoTheLogFile] 
    SET ALLOW_SNAPSHOT_ISOLATION ON;

Then I'll insert a row into that table we created, and  update that row inside a (default, locking read committed) transaction:

    INSERT INTO dbo.BeretGuy
        (Id, Antic)
    VALUES
        (1388, 'Subduction License');

    BEGIN TRANSACTION;

    UPDATE dbo.BeretGuy
    SET Antic = ''
    WHERE Id = 1388;

Next I'll open a new SSMS window and run this script, which starts a `SNAPSHOT` transactions to modify the same row as the one in the table above.  It immediately starts waiting (at the first `UPDATE` statement) on the lock currently held by the query in the first window.

    SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
    BEGIN TRANSACTION;

    UPDATE dbo.BeretGuy -- query is blocked here
    SET Antic = ''
    WHERE Id = 1388;

    SELECT Id, Antic
    FROM dbo.BeretGuy;

    UPDATE dbo.BeretGuy
    SET Antic = 'Subduction License'
    WHERE Id = 1388;

    COMMIT TRANSACTION;

If I now go back to the first window and and execute:

    COMMIT TRANSACTION;

The snapshot query fails immediately with this (expected) error message:

> Msg 3960, Level 16, State 6, Line 4  
> Snapshot isolation transaction aborted due to update conflict. You cannot use snapshot isolation to access table 'dbo.BeretGuy' directly or indirectly in database 'IntoTheLogFile' to update, delete, or insert the row that has been modified or deleted by another transaction. Retry the transaction or change the isolation level for the update/delete statement.

Notice that the error is on line 4, which is the first update query in that script.  If that were a procedure, and I was troubleshooting issues with it, I might try commenting out the first update - just to see if I can get past that problem.  

If I repeat the steps above with the first update commented out, I actually get results from the `SELECT` query (yay, right?), and then this error immediately follows:

> Msg 3960, Level 16, State 6, Line 11  
> Snapshot isolation transaction aborted due to update conflict [...]

Now the error is on line 11 (the second update query in the script).  Even thought the script was doomed to fail, the `SELECT` was still able to complete, because the transaction doesn't *really* start until the `UPDATE` query (where it then fails due to snapshot write conflict detection).

As I continue to thrash around troubleshooting things, I might also notice that the whole demo succeeds if I avoid using the `SNAPSHOT` isolation level.  Of course, this changes the logic of the system.

This example is rather trivial, but imagine debugging a complex procedure, with lots of moving parts.  Seeing errors seemingly move around, or some parts of the query succeeding while others fail, would be pretty puzzling.

## Summary

It makes total sense that the `BEGIN TRAN` won't be written to the log until it's actually necessary.  Writing to disk is *expensive*, so SQL Server will avoid it when possible.  They are all kinds of nifty little things SQL Server does behind the scenes to avoid writes (see Paul White's [The Impact of Non-Updating Updates][5] for another example), and I thought it was cool to learn that transactions are on that list.

It can be helpful to keep this in mind when troubleshooting procedures that use explicit transactions, as errors might be reported in surprising places depending on where the transaction actually "begins" (according to the transaction log).

Thanks for reading!

[1]: https://docs.microsoft.com/en-us/sql/t-sql/language-elements/begin-transaction-transact-sql?view=sql-server-2017
[2]: https://xkcd.com/1334/
[3]: {{ site.url }}/assets/2019-06-05-non-modifying.PNG
[4]: {{ site.url }}/assets/2019-06-05-modifying.PNG
[5]: https://www.sql.kiwi/2010/08/the-impact-of-non-updating-updates.html
[6]: https://www.joshthecoder.com/2018/06/29/locks-on-system-tables.html