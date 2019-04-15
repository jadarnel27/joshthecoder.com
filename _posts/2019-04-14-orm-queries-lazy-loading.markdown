---
layout: series
title:  "ORM Queries: Problematic Lazy Loading"
categories: 
tags: [ORM Queries]
---

## Convenience

One of the nice things about ORMs from a development standpoint, is that you can really easily access "related entities."

For instance, if you're looking at a comment on Stack Overflow, a natural related entity would be the user object.

## All Loops Are Terrible

Let's say my requirement is to show an arbitrary list of 100 comments and who said them.

One way to do that would be this:

    using (var db = new BloggingContext())
    {
        var comments = db.StackOverflowComments.Take(100).ToList();

        foreach (var comment in comments)
        {
            Console.WriteLine(
                $"{comment.User?.DisplayName} said: {comment.Text.Substring(0, 10)}");
        }

        Console.ReadLine();
    }

[![Screenshot of console output][1]][1]

Notice I'm able to easily access the user's display name, even though I queried for comments.

The `ToList()` line produces this SQL:

    SELECT TOP (100) 
        [c].[Id] AS [Id], 
        [c].[CreationDate] AS [CreationDate], 
        [c].[PostId] AS [PostId], 
        [c].[Score] AS [Score], 
        [c].[Text] AS [Text], 
        [c].[UserId] AS [UserId]
    FROM [dbo].[StackOverflowComments] AS [c]

It's easy to think that, after getting the Comments and calling "`.ToList()`", all of the querying is over.

This is not the case.  

Each time we access `comment.User` inside that loop, Entity Framework sends a query to SQL Server that looks like this:

    SELECT 
        [Extent1].[Id] AS [Id], 
        /* all the columns, you know by now */
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    WHERE [Extent1].[Id] = @EntityKeyValue1

So that innocuous code executes 101 queries.  I've heard this called the "N+1 query problem" by [Oren Eini (AKA Ayende)][2].  It's also one of the warnings emitted by [MiniProfiler][3], a lightweight profiling tool created by the folks at Stack Overflow.

## Y Tho

This is called Lazy Loading, and is the default mode of fetching related entities and child collections in Entity Framework (and NHibernate).

I think this is actually a reasonable default, since many times you are probably not accessing those entities at all.  Imagine if everytime you searched for a User in EF if every Comment that user ever left was also retrieved - just in case you need it.  That's...not ideal.

## What To Do About It

We need to tell the ORM that we want the related entities up front - then it's smart enough to write a query that includes *all* of the data we need.  The general term for this approach is *eager* loading.

In Entity Framework, this is done using the `Include` method (NHibernate calls it `Fetch`).  Adding that call to our code:

    var comments = db.StackOverflowComments
        .Include(c => c.User)
        .Take(100)
        .ToList();

Results in this SQL being executed:

    SELECT TOP (100) 
        [Extent1].[Id] AS [Id], 
        [Extent1].[CreationDate] AS [CreationDate], 
        /* all the comment columns */
        [Extent2].[Id] AS [Id1], 
        [Extent2].[AboutMe] AS [AboutMe], 
        /* all the user columns */
    FROM  [dbo].[StackOverflowComments] AS [Extent1]
        LEFT OUTER JOIN [dbo].[StackOverflowUsers] AS [Extent2] ON [Extent1].[UserId] = [Extent2].[Id]

Much, much better - we left join to get the user with the comments all in one query!

Note that we could, and should, define a projection in order to avoid [selecting all the columns][4].

## Do This Up Front

This requires some extra legwork from developers, but try to always think about what data your ORM query will be using.  If there are related entities involved, make sure to define that requirement with `Include`.

Happy ORMing!

[1]: {{ site.url }}/assets/2019-04-14-comments-by-users.PNG
[2]: https://ayende.com/blog/3732/solving-the-select-n-1-problem
[3]: https://miniprofiler.com/
[4]: https://www.joshthecoder.com/2019/02/14/orm-queries-selecting-all-columns.html