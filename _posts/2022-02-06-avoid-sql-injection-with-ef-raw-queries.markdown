---
layout: post
title:  "Avoid SQL Injection with EF Raw Queries"
categories: 
tags: 
---

This blog post is mostly a PSA for developers using Entity Framework in The Modern Era.  Because no one reads the documentation.

## The Bad Old Days

Ten years ago, I saw SQL concatenated with user input in production code *all the time*.  I even wrote some 😬

Code that does this is vulnerable to an exploit called "SQL injection." If you haven't heard of that, and you're writing production code, you should stop reading this blog and Google that term right away 😀

Anyway thanks to the tireless blogging and Stack Overflow answering of many nice folks, as well as one iconic web comic, I learned my lesson - as did many other people, it seems.

## Enter the ORM

These days, most .NET developers seem to write SQL using Entity Framework, and specifically using LINQ.  This is very convenient for us developers, and I'm sure most DBAs love it too.

One of the nice things about LINQ is that it's not really vulnerable to SQL injection.  C# code gets turned into SQL queries, and variables get translated into parameters automatically.

Thus folks who have *only* worked with ORMs and LINQ may not have ever learned about the bad old days.  Which is normally fine, until...

## Using "Raw" SQL in EF

Sometimes you just need to write a SQL query.  Either the generated SQL is too bad, or the query you want can't be expressed in LINQ, or there's some other limitation you're trying to work around.  But regardless, EF Core (and older versions of EF) give you the ability to write a SQL query directly.  

## The Wrong Way

Here's what that looks like, against a copy of the "Posts" table in the Stack Overflow sample database.  I've written a query that will find all the posts that start with "Hello" and reduce their score by 5.

EXTRA NOTE: to be very clear, this code is vulnerable to SQL injection - this is the wrong way to do it, and should not be done in real code:

    var bodyStartsWith = "<p>Hello";

    using var context = new StackOverflowContext();

    var query = @"
    UPDATE dbo.PostsThrowaway 
    SET Score = Score - 5
    WHERE Body LIKE '" + bodyStartsWith + "'";

    var rowsAffected = context.Database.ExecuteSqlRaw(query);

    Console.WriteLine($"Affected '{rowsAffected}'");

This works just fine.  But, as I mentioned, it's vulnerable to SQL injection attacks.  If I change that string variable to this:

    var bodyStartsWith = "<p>Hello'; DROP TABLE dbo.PostsThrowaway;--";

...the table is deleted:

[![Screenshot of object explorer in SSMS before and after the query showing the table has been deleted][1]][1]

Bad times.

## The Right Way

There are a couple of ways you can use parameters with the raw SQL API in EF Core.  Here's one of them:

    var query = @"
    UPDATE dbo.PostsThrowaway 
    SET Score = Score - 5
    WHERE Body LIKE '{0}'";

    var rowsAffected = context.Database.ExecuteSqlRaw(query, bodyStartsWith);

That string now gets wrapped in a parameter behind the scenes and can be executed safely.  For other ways to use parameters, check out [the docs on raw SQL][2].

## Why, Josh, Why?

You might ask why I'm blogging about this, since it's been plastered over the Internet for decades.

Just because something has become common knowledge to you or me, doesn't mean new folks are going to know about it.  They probably won't.  Especially if they've been using tools and abstractions that shield them from issues like this for most of their careers.  Maybe those folks will learn something here, and we can keep making our codebases better.

You might *also* ask why I'm blogging about this, since there just huge warnings plastered all over the docs (and I'd like to extend a huge thank you to the community and the docs team for making this so prominent):

[Raw SQL Queries - EF Core \| Microsoft Docs][2]

[![Screenshot of object explorer in SSMS before and after the query showing the table has been deleted][3]][3]

Well...that's because people are bad at reading 😜  I'm trying to spread the news here!

Thanks for stopping by!


[1]: {{ site.url }}/assets/2022-02-06-before-and-after.png
[2]: https://docs.microsoft.com/en-us/ef/core/querying/raw-sql
[3]: {{ site.url }}/assets/2022-02-06-docs-warning.png