---
layout: series
title:  "ORM Queries: Premature Materialization (Part 3)"
categories: 
tags: [ORM Queries]
---

## Recap

If you just showed up, I'd recommend going back to part 1 to see [what this is all about][1], and then check out part 2 about [the infamous System.NotSupportedException][2].

Okay, on to the fun stuff.

## Paging Through a List of Results

I'm creating a page that lets me view all the Stack Overflow users with more than 10,000 reputation points.  In the 2010 Stack Overflow database, that's a little over 8,000 users.  I've been asked to implement paging, as end users only want to see around 20 users at a time.  Here's my code:

    int page = 1;
    int rowsPerPage = 20;

    var users = db.StackOverflowUsers
        .Where(u => u.Reputation > 10000)
        .OrderByDescending(u => u.Reputation)
        .ToList();

    var pagedUsers = users
        .Skip((page - 1) * rowsPerPage)
        .Take(rowsPerPage);

    foreach (var user in pagedUsers)
    {
        Console.WriteLine($"{user.DisplayName} - {user.Reputation}");
    }

## What's the Damage

This has similar problems to the query in part 2, just on a smaller scale.  The 8,000+ user objects are loaded into RAM on the app server, taking up 16 MB, but only 20 are displayed in the app.  

Here's the generated query and execution plan, as expected:

    SELECT 
        [Extent1].[Id] AS [Id], 
        [Extent1].[AboutMe] AS [AboutMe], 
        /* all the columns */
        [Extent1].[AccountId] AS [AccountId]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    WHERE [Extent1].[Reputation] > 10000
    ORDER BY [Extent1].[Reputation] DESC

![Screenshot of Plan Explorer showing plan shape and memory grant][3]

In addition to scanning the whole clustered index, the query requires a 43.6 MB memory grant to sort the 8,000 rows.  What's worse is that, because of the specific data in this set, only a little over 6 MB of the memory is used - the rest is a waste.

## Solving

The solution here is to know that the `.Skip` and `.Take` LINQ extension methods are *supported* in EF and NHibernate.  Here's the updated C# code:

    var users = db.StackOverflowUsers
        .Where(u => u.Reputation > 10000)
        .OrderByDescending(u => u.Reputation)
        .Skip((page - 1) * rowsPerPage)
        .Take(rowsPerPage)
        .Select(u => new { u.DisplayName, u.Reputation })
        .ToList();

And it produces this lovely T-SQL:

    SELECT 
        [Extent1].[Reputation] AS [Reputation], 
        [Extent1].[DisplayName] AS [DisplayName]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    WHERE [Extent1].[Reputation] > 10000
    ORDER BY row_number() OVER (ORDER BY [Extent1].[Reputation] DESC)
    OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY

![Screenshot of Plan Explorer showing plan shape and memory grant for the improved query][4]

Now that's much nicer!  Unfortunately, the execution plan isn't *awesome.*  It gets a much smaller memory grant of 3.8 MB (because of the smaller select list, and the row goal).  

But now it has a parallel zone now (it's just barely over the default Cost Threshold for Parallelism value of 5), and does slightly more reads than the previous query.  This could be fixed with an index on Reputation:

    CREATE NONCLUSTERED INDEX IX_Reputation_Includes
    ON dbo.StackOverflowUsers (Reputation DESC)
    INCLUDE (DisplayName);

![Screenshot of Plan Explorer showing plan shape and memory grant for the indexed query][5]

No sort, no memory grant, no parallelism - just 3 logical reads.

## On Older Versions

You might be thinking "I don't have that new-fangled `OFFSET` / `FETCH` stuff on my database server."  

This approach also degrades gracefully if you are on an older version of SQL Server that doesn't have `OFFSET` / `FETCH`.  If I point my query at a copy of the database on a 2008 instance, Entity Framework generates the T-SQL instead (without any code changes):

    SELECT TOP (20) 
        [Filter1].[Reputation] AS [Reputation], 
        [Filter1].[DisplayName] AS [DisplayName]
    FROM ( 
        SELECT 
            [Extent1].[DisplayName] AS [DisplayName], 
            [Extent1].[Reputation] AS [Reputation], 
            row_number() OVER (ORDER BY [Extent1].[Reputation] DESC) AS [row_number]
        FROM [dbo].[StackOverflowUsers] AS [Extent1]
        WHERE [Extent1].[Reputation] > 10000
    )  AS [Filter1]
    WHERE [Filter1].[row_number] > 0
    ORDER BY [Filter1].[Reputation] DESC

Not that any of us are using soon-to-be-deprecated software...right? 😜

## Not Next Up

Okay, I think that's it for premature materialization.  I hope this helps you to recognize these queries when you see them, and provides some concrete guidance on what to do to improve the situation.

Happy ORMing!

[1]: https://www.joshthecoder.com/2019/04/23/orm-queries-premature-materialization-part-1.html
[2]: https://www.joshthecoder.com/2019/04/24/orm-queries-premature-materialization-part-2.html
[3]: {{ site.url }}/assets/2019-04-29-execution-plan-bad.PNG
[4]: {{ site.url }}/assets/2019-04-29-execution-plan-better.PNG
[5]: {{ site.url }}/assets/2019-04-29-execution-plan-much-better.PNG