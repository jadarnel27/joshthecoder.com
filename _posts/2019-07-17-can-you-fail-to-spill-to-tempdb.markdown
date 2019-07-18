---
layout: post
title:  "Can You Fail To Spill To tempdb?"
categories: 
tags: 
---

One of my colleagues reached out to me recently about a production issue where a SQL Server Agent job had failed with this error message:

> Msg 1105, Level 17, State 2, Line 15  
> Could not allocate space for object 'dbo.SORT temporary run storage:  140737513062400' in database 'tempdb' because the 'PRIMARY' filegroup is full. Create disk space by deleting unneeded files, dropping objects in the filegroup, adding additional files to the filegroup, or setting autogrowth on for existing files in the filegroup.

I fully expected this to be a scheduled maintenance task, like index rebuilds or statistics updates.  I've seen this error before in those contexts (rebuilding large indexes in `tempdb`, or updating statistics with `FULLSCAN`).

In the latest of a lifelong series of situations where my intuition failed me, my expectation was incorrect.  In fact, the job was an ETL.  And the step that failed wasn't creating temp tables, or indexes, or anything that I might have expected.  I thought that was pretty intriguing, and thus this blog post.

## Major Spillage

Feel free to stand and salute while reading that heading 😎

Using the small, 2010 version of the Stack Overflow sample database, I'll run this query:

    SELECT p.Id FROM dbo.Posts p ORDER BY p.Body;

Here's the execution plan:

![[screenshot of spilling execution plan][1]][1]

As you can see from the little warning icon, it spills to `tempdb`.  Massively:

![[screenshot of tooltip showing tempdb spill details][2]][2]

Further slowing things down, my `tempdb` files actually grew repeatedly during this operation:

![[screenshot of autogrow events][3]][3]

## "Optimizing" tempdb

For the purposes of this demo, I'm now going to shrink all of my `tempdb` files back down to their default size (8 MB on my machine):

    DBCC SHRINKDATABASE(N'tempdb')

And then disable autogrow:

    USE [master]
    GO
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'tempdev', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp2', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp3', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp4', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp5', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp6', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp7', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'temp8', FILEGROWTH = 0);
    ALTER DATABASE [tempdb] MODIFY FILE (NAME = N'templog', FILEGROWTH = 0);

In real life, autogrow really was disabled on the `tempdb` files.  They had been evenly expanded to fill the dedicated `tempdb` drive.

## Trying to Spill

So what happens when I try to run that query now?  I can tell you that it does not magically get a bigger memory grant.  Nor does it find some way to use the limited `tempdb` space available to do the sorting.

As you might expect from all the build up, the query fails very quickly with an error similar to the one from the beginning of this post:

> Msg 1101, Level 17, State 1, Line 1  
> Could not allocate a new page for database 'tempdb' because of insufficient disk space in filegroup 'PRIMARY'. Create the necessary space by dropping objects in the filegroup, adding additional files to the filegroup, or setting autogrowth on for existing files in the filegroup.

My local demo here is on SQL Server 2019 CTP 3.0.  The real issue occurred on SQL Server 2012, which may explain the difference in the error messages.

## Don't Assume

It's easy to jump to conclusions based on similar symptoms.  This was just a little reminder, for me at least, to make sure and understand the context and details of a situation before recommending a solution.

Some options in our case would be to 

- allocate more space to `tempdb`, 
- tune the queries involved to avoid the spills, or 
- examine the other concurrent activity on the server to see if its `tempdb` usage can be reduced (or rescheduled to not coincide with the ETL).

Thanks for reading!

[1]: {{ site.url }}/assets/2019-07-17-spill-plan.PNG
[2]: {{ site.url }}/assets/2019-07-17-spill-details.PNG
[3]: {{ site.url }}/assets/2019-07-17-tempdb-growths.PNG