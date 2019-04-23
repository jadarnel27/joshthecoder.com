---
layout: series
title:  "ORM Queries: Premature Materialization (Part 3)"
categories: 
tags: [ORM Queries]
---

## Recap

Part 2 was 

On to the fun stuff.

## Paging Through a List of Results

Now I'm creating a page that lets me view all the Stack Overflow users with more than 10,000 reputation points.  In the 2010 Stack Overflow database, that's a little over 8,000 users.  I've been asked to implement paging, as end users only want to see around 20 users at a time.  Here's my code:

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

This has similar problems the query above, just on a smaller scale.  The 8,000 user objects are loaded into RAM on the app server, and only 20 are displayed in the app.

The solution here is to know that the `.Skip` and `.Take` LINQ extension methods are supported in EF and NHibernate.  Here's the updated C# code:

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

Much better!  It also degrades gracefully if you are on an older version of SQL Server that doesn't have `OFFSET` / `FETCH`.  If I point my query at a copy of the database on a 2008 instance:

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



Happy ORMing!
