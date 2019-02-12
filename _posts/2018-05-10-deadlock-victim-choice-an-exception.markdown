---
layout: post
title:  "Deadlock Victim Choice in SQL Server - An Exception?"
date:   2018-05-10 15:46:00 -0400
categories: 
---
## How are deadlock victims chosen?
When a deadlock occurs in SQL Server, a "victim" is chosen based on two main 
criteria: deadlock priority and log usage (AKA which query is easier to roll 
back)

In addition to being well documented around the Internet in forums and blogs and 
such, the official documentation on [`SET DEADLOCK_PRIORITY`][1] has this to 
say:

> - If both sessions have the same deadlock priority, the instance of SQL 
> Server chooses the session that is less expensive to roll back as the 
> deadlock victim. For example, if both sessions have set their deadlock 
> priority to HIGH, the instance will choose as a victim the session it 
> estimates is less costly to roll back. The cost is determined by comparing 
> the number of log bytes written to that point in each transaction. (You can 
> see this value as "Log Used" in a deadlock graph).  

> - If the sessions have different deadlock priorities, the session with the 
> lowest deadlock priority is chosen as the deadlock victim.

I recently discovered an exception to this rule in SQL Server 2014 and higher: the 
`ALTER INDEX...REORGANIZE` command

## The demo
I'll walk through a small reproduction of the issue.  This behavior is specific 
to SQL Server 2014 and higher.

This first script creates a database in which to perform the test.  This 
database has a table with a single index.  After the objects are created, we 
set deadlock priority to -10 (the lowest possible value) and then start 
running a select that will scan the entire index.

*Note: you should disable resultsets in this window in order for the select to 
be able to run more frequently, and to reduce CPU usage by SSMS.  Go to 
Query -> Query Options -> Results -> and check "Discard results after 
execution"*

	USE master;
	GO

	IF (DB_ID(N'DeadlockTest') IS NOT NULL) 
	BEGIN
		ALTER DATABASE DeadlockTest
		SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
		DROP DATABASE DeadlockTest;
	END

	CREATE DATABASE DeadlockTest;
	GO

	USE DeadlockTest;
	GO

	CREATE TABLE TableWithFragmentedIndex
	(
		Id INT NOT NULL IDENTITY(1,1),
		AnotherField VARCHAR(100),
	);
	CREATE CLUSTERED INDEX IX_TableWithFragmentedIndex_AnotherField 
		ON TableWithFragmentedIndex (AnotherField);
	GO

	-- Make sure to go to Query -> Query Options -> Results -> check "Discard 
	-- results after execution"
	SET NOCOUNT ON;
	SET DEADLOCK_PRIORITY -10;

	WHILE 1 = 1
		SELECT * FROM TableWithFragmentedIndex;

While that continues to run, open a separate query window in SSMS and run the 
script below.  It sets deadlock priority to 10 (the highest possible value), 
then performs inserts and deletes until >50% index fragmentation is achieved.  
Once that is done, it executes the `ALTER INDEX` command to reorganize the 
index.

	USE DeadlockTest;

	SET NOCOUNT ON;
	SET DEADLOCK_PRIORITY 10;

	DECLARE @anotherField INT = 0;
	DECLARE @fragmentationAchieved BIT = 0

	DECLARE @databaseId as smallint = DB_ID(N'DeadlockTest');
	DECLARE @objectId as INT = OBJECT_ID(N'dbo.TableWithFragmentedIndex');
	DECLARE @indexId as SMALLINT = 
		(SELECT ind.index_id 
		 FROM sys.indexes ind 
		 WHERE ind.[name] = 'IX_TableWithFragmentedIndex_AnotherField');

	-- Run inserts and deletes until index fragmentation exceeds 50%
	WHILE (@fragmentationAchieved <> 1)
	BEGIN
		INSERT INTO TableWithFragmentedIndex (AnotherField) 
		VALUES (@anotherField);
		
		IF @anotherField % 5 = 0
		BEGIN
			DELETE TableWithFragmentedIndex WHERE Id = (@anotherField - 2);
			DELETE TableWithFragmentedIndex WHERE Id = (@anotherField - 3);
		END

		IF (SELECT stat.[avg_fragmentation_in_percent]
		FROM sys.dm_db_index_physical_stats 
			(@databaseId, @objectId, @indexId, NULL, NULL) AS stat
			INNER JOIN sys.indexes AS i 
				ON stat.[object_id] = i.[object_id] 
				AND stat.index_id = i.index_id) > 50
		BEGIN
			SET @fragmentationAchieved = 1;
		END

		SET @anotherField = @anotherField + 1;

	END

	ALTER INDEX [IX_TableWithFragmentedIndex_AnotherField] 
		ON [DeadlockTest].[dbo].[TableWithFragmentedIndex] 
		REORGANIZE WITH (LOB_COMPACTION = ON);

After a few seconds, the `SELECT` and `ALTER INDEX` commands deadlock on pages 
in the heap.  Surprisingly, the `ALTER INDEX` is chosen as the deadlock victim - 
despite being at the highest possible deadlock priority.  Here's a very small
 snippet from the deadlock graph:

	<deadlock>
	 <victim-list>
	  <victimProcess id="process2669dd708c8" />
	 </victim-list>
	 <process-list>
	  <process id="process2669dd708c8" logused="0" priority="10">...</process>
	  <process id="process26696853c28" logused="0" priority="-10">...</process>
	 </process-list>

As you can see, process "process2669dd708c8" was chosen as the victim with a 
priority of 10, despite being up against a process with a priority of -10.

You can [download the complete deadlock graph][2] if you'd like to take a closer 
look.

## Additional thoughts
An index reorganize can be stopped at any point and does not need to be rolled 
back.  So it does seem like a logical choice as a deadlock victim - so the 
behavior makes sense in a way, but it is still surprising.

## Other versions
It appears this is some kind of regression, or maybe a new "feature" of SQL 
Server.  I ran the same demo on SQL Server 2012 and SQL Server 2008R2 and the 
"correct" victim was chosen (the `SELECT` query with priority of -10).
		
[1]: https://docs.microsoft.com/en-us/sql/t-sql/statements/set-deadlock-priority-transact-sql?view=sql-server-2017
[2]: {{ site.url }}/assets/2018-05-14-backwards-deadlock.xml
