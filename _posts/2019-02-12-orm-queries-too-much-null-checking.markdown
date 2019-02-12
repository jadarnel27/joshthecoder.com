---
layout: post
title:  "ORM Queries: Too Much NULL Checking"
categories: 
---

## About ORMs

I have a love / hate relationship with ORMs.  

My background is in full stack .NET development, mostly ASP.NET MVC web applications.  I'm a fan of ORMs from a developer productivity standpoint.  They lets us write more features with less code.  They also enable developers who don't know SQL very well to do things they otherwise wouldn't be able to do.

> Side note: as with most things, ORMs are great when they work, but they are a monumental pain when they don't.  It's often very difficult to get past all the abstractions to figure out why things aren't going as expected.

I've worked with SQL Server my whole career, but have recently become more of an enthusiast in databases than ever before.  From a database administration or performance tuning perspective, ORMs can be very problematic.  This post talks about one of those problems: unnecessarily checking for NULL in LINQ queries

## An Odd Query

Let's say I'm asked to implement a search feature to my blog, allowing people to search by title.

I add the feature, using Entity Framework for data access.  Later, the DBA finds this weird query:

    SELECT
        [Extent1].[PostId] AS [PostId],
        [Extent1].[Title] AS [Title],
        [Extent1].[Content] AS [Content],
        [Extent1].[BlogId] AS [BlogId]
    FROM [dbo].[Posts] AS [Extent1]
    WHERE
        CASE WHEN ([Extent1].[Title] IS NULL) THEN N''
        ELSE [Extent1].[Title]
        END LIKE @p__linq__0 ESCAPE N'~';

They see I'm passing a parameter to search the `dbo.Posts` table.  But depending on whether or not the `Title` in a given row is `NULL`, we compare that parameter to an empty string instead of the value in the `Title` column.

## The Entity Framework Code

The C# code that I wrote to perform the search looks like this:

    using (var db = new BloggingContext())
    {
        var titleSearchText = "29";
        var posts = db.Posts
            .Where(p => (p.Title ?? "").StartsWith(titleSearchText))
            .ToList();

        Console.WriteLine("Results:");

        foreach (var post in posts)
        {
            Console.WriteLine(" " + post.Title);
        }

        Console.ReadLine();
    }

There's some plumbing code in there that's not relevant, but the important bit is the predicate here:

    .Where(p => (p.Title ?? "").StartsWith(titleSearchText))

This means if the post `Title` is `NULL`, replace it with "" and then see if it starts with the search text.

## The Rewrite

The simple, and valid, solution is to remove the `NULL` check from the Entity Framework query, like this:

    .Where(p => p.Title.StartsWith(titleSearchText))

Which produces this much more natural-looking query:

    SELECT
        [Extent1].[PostId] AS [PostId],
        [Extent1].[Title] AS [Title],
        [Extent1].[Content] AS [Content],
        [Extent1].[BlogId] AS [BlogId]
    FROM [dbo].[Posts] AS [Extent1]
    WHERE
        [Extent1].[Title] LIKE @p__linq__0 ESCAPE N'~'

This query works just fine, is easier to understand, and has a better chance of being SARGable.

So why did I write that strange-looking null replacement code to begin with?

## The Problem with NULL in .NET

Text strings in .NET are always nullable (unless you opt-in to [relatively new preview behavior in C# 8][1]).

If you try to call an instance method (like `.StartsWith(...)`) on a `null` reference, you get an error - specifically a `NullReferenceException`.  Thus many .NET programmers get used to defensively making sure they don't try to access properties or values of a `null` reference.

Taking the current version of the code, that produces a nice query.  I'll rewrite it slightly to use only in-memory objects:

    var titleSearchText = "29";
    var allPosts = new List<Post>
    {
        new Post { Title = "1 - Test Blog #1" },
        new Post { Title = "29 - Test Blog #29" },
        new Post { Title = null }
    };
    var posts = allPosts
        .Where(p => p.Title.StartsWith(titleSearchText))
        .ToList();

This doesn't interact with the database or Entity Framework at all.  It creates an in-memory list of 3 posts, one of which has a `null` title.  While this `WHERE` predicate worked with the Entity Framework query, it results in the above-mentioned error now:

> System.NullReferenceException: 'Object reference not set to an instance of an object.'

Changing it back to the original form, with the null replacement, avoids the error.  Which is exactly why experienced .NET programmers will write it that way the first time - they've been burned before!

## What To Do About It

When writing ORM code that's going to be converted into T-SQL, resist the urge to do this defensive coding.  It's not necessary, and causes confusing (and potentially hard-to-tune) T-SQL to be generated.

I hope this helps relieve a little bit of ORM pain for you folks out there!

[1]: https://blogs.msdn.microsoft.com/dotnet/2017/11/15/nullable-reference-types-in-csharp/