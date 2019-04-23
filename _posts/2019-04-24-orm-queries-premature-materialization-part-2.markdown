---
layout: series
title:  "ORM Queries: Premature Materialization (Part 2)"
categories: 
tags: [ORM Queries]
---

## Recap

Part 1 was a little bit of background on what premature materialization is (it's definitely not some kind of subtle double entendre), why it matters, and how it happens.

On to the fun stuff.

## Working Around System.NotSupportedException

Let's say I have a totally realistic, non-contrived requirement to find all users where the 6th character of their display name is a J.  I might try this:

    var users = db.StackOverflowUsers
        .Where(u => u.DisplayName.IndexOf('j') == 5)
        .ToList();

Running that code, I get an error from Entity Framework:

> An unhandled exception of type 'System.NotSupportedException' occurred in EntityFramework.SqlServer.dll
> 
> LINQ to Entities does not recognize the method 'Int32 IndexOf(Char)' method, and this method cannot be translated into a store expression.

Being a busy developer under tight deadlines, I skim a Stack Overflow answer that says I just need to put the `Where(...)` part after the `ToList()` part.  I try that:

    var users = db.StackOverflowUsers
        .ToList()
        .Where(u => u.DisplayName.IndexOf('j') == 5);

And it works!  Yay, right?  

No, not right.  Here's the query that was executed:

    SELECT 
        [Extent1].[Id] AS [Id], 
        [Extent1].[AboutMe] AS [AboutMe], 
        /* all the columns */
        [Extent1].[AccountId] AS [AccountId]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]

Notice the ominous lack of a `WHERE` clause.  Pretty sure I told it specifically about the `WHERE` clause, *janky ORM, grumble grumble...*

So we've selected every row in the table (299,611 rows in the "small" 2010 version of the Stack Overflow database).  Not ideal, but it's not *too* bad, right?  

No, still not right.

It loads all of those entities into memory on the application side.  I took a heap snapshot in Visual Studio, and you can see all the objects, and their total size:

[![screenshot of allocated size for .NET objects][1]][1]

That's about 213 MB of RAM on the app server just to satisfy this one instance of this query.  Scale that up accordingly as multiple users try to access this feature.

The worst part is that there are only 950 rows that actually qualify for this predicate, so all of the rest get discarded.

"Discarding" things might sound cheap, but it incurs a variety of overheads in a .NET application.  Most of those I covered in part 1 (the CPU cost of allocating and garbage collecting (GCing) all these objects that are never used for anything, LOH allocations, GC pauses).  On top of all that, the large text strings in the "About Me" column incur even more LOH allocations with this specific query.

## Being Conservative with .NET Memory Usage

The `dbo.Users` table only takes up around 57 MB of disk space in this database:

[![screenshot of allocated size for database table][2]][2]

But it took up 213 MB of memory to load it into the .NET app.  I mention this to point out yet another reason to be careful how much data we're pulling back from SQL Server.

## Solving This The Right Way

There's not an easy, general purpose solution to this problem.  Like the error messages says, need to use a supported operation.  

In this case, the solution is as easy as replacing single quotes with double quotes:

    var users = db.StackOverflowUsers
        .Where(c => c.DisplayName.IndexOf("j") == 5)
        .ToList();

The version of `IndexOf` that takes a `char` parameter is not supported, but the version that takes a `string` parameter is - for some weird reason.

That LINQ statement produces this query:

    SELECT 
        [Extent1].[DisplayName] AS [DisplayName]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    WHERE 5 = (( CAST(CHARINDEX(N'j', [Extent1].[DisplayName]) AS int)) - 1)

...which would not be awesome to index for (you could get creative with indexed computed columns), but it does only return the rows requested.  So it's a big improvement.

In other situations, you may need to question the requirements or use [raw SQL][3].

You can also browse through the list of supported methods here, if you're looking for inspiration: [CLR Method to Canonical Function Mapping][4]

## Next Up

Like I said, `System.NotSupportedException` can be tricker to fix.  You need to dig into your requirements and see if you can use a supported operation.  Just make sure you don't go straight to calling `ToList()` early in the query as a workaround, as that's likely causing more harm than good.

In episode three of this series, we're going to talk about the pitfalls of paging queries.

Oh, and happy ORMing!

[1]: {{ site.url }}/assets/2019-04-22-memory-used.PNG
[2]: {{ site.url }}/assets/2019-04-22-disk-used.PNG
[3]: https://docs.microsoft.com/en-us/ef/core/querying/raw-sql
[4]: https://docs.microsoft.com/en-us/dotnet/framework/data/adonet/ef/language-reference/clr-method-to-canonical-function-mapping