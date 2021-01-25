---
layout: series
title:  "ORM Queries: Too Many Roundtrips"
categories: 
tags: [ORM Queries]
---

In Entity Framework, it's easy to write code that will result in a "chatty" interaction with the database server.  I [wrote previously][1] about being chatty in the context of read queries (lazy loading).  This time, let's talk about write queries.

## Inserting Multiple Rows in EF Core

Entity Framework Core is the latest and greatest of EF.  Let's try adding multiple rows in a couple of ways.  This is using some models from the MS Docs tutorials on [Getting Started with Entity Framework][3].

First we'll go with this:

    var newBlogUrls = new List<string>()
    {
        "http://joshthecoder.com/one",
        "http://joshthecoder.com/two",
        "http://joshthecoder.com/three",
        "https://joshthecoder.com/four"
    };

    using (var db = new BloggingContext())
    {
        foreach (var blogUrl in newBlogUrls)
        {
            db.Add(new Blog { Url = blogUrl });
            db.SaveChanges();
        }
    }

We have a list of new blog URLs, we loop through them.  On each iteration, we had the new blog row and save it to the database.

This results in 4 roundtrips to the database:

[![screenshot of XE session output showing 4 rpc_completed events][4]][4]

Note: each roundtrip executes 3 T-SQL statements (one to set `NOCOUNT` on, one to insert the row, and one to get the ID of the newly inserted row to send back to the .NET application)

Okay, that's not ideal.  The good news is that we can move the `SaveChanges()` outside of the loop.  We can make many changes to our data model in EF, and then call `SaveChanges()` to sync those changes to the database.  Here's what that looks like:

    var newBlogUrls = new List<string>()
    {
        "http://joshthecoder.com/one",
        "http://joshthecoder.com/two",
        "http://joshthecoder.com/three",
        "https://joshthecoder.com/four"
    };

    using (var db = new BloggingContext())
    {
        foreach (var blogUrl in newBlogUrls)
        {
            db.Add(new Blog { Url = blogUrl });
        }
        db.SaveChanges();
    }

Now we just get one roundtrip to the database:

[![screenshot of XE session output showing 1 rpc_completed events][5]][5]

Here are the details of the `MERGE` and `SELECT` statements, in case you're interested:

    SET NOCOUNT ON;

    DECLARE @inserted0 TABLE ([BlogId] int, [_Position] [int]);

    MERGE [Blogs] USING (
    VALUES (@p0, 0),
    (@p1, 1),
    (@p2, 2),
    (@p3, 3)) AS i ([Url], _Position) ON 1=0
    WHEN NOT MATCHED THEN
    INSERT ([Url])
    VALUES (i.[Url])
    OUTPUT INSERTED.[BlogId], i._Position
    INTO @inserted0;

    SELECT [t].[BlogId] FROM [Blogs] t
    INNER JOIN @inserted0 i ON ([t].[BlogId] = [i].[BlogId])
    ORDER BY [i].[_Position];

EF Core is doing some serious gymnastics to do this in one roundtrip *and* give back the generated IDs related to the right entities.

It uses the `VALUES` clause in the `MERGE` statement to assign a row number to each of the rows to be inserted.  Then uses `OUTPUT` to dump the new IDs into a table variable along with the row numbers it assigned previously.  Finally, the new IDs are `SELECT`ed in the position order previously established so that EF Core can associate the IDs with the right entities.

I am a little weirded out by this behind-the-scenes use of `MERGE`, since there are [many well-known bugs, issues, and limitations with that feature][6] (h/t to Aaron Bertrand for that great article).  I guess we take the good with the bad though.

Despite the concerns about `MERGE`, seeing this certainly makes me grateful for the work the EF team at Microsoft have put into this product!

## Trying this in EF6

EF6 is the latest (and final) version of the "full framework" version of Entity Framework.  Trying the "fixed" code (with `SaveChanges()` outside the loop), unfortunately, results in 4 roundtrips to the database!

[![screenshot of XE session output showing 4 rpc_completed events][2]][2]

Note: each roundtrip executes 2 T-SQL statements: one to do the insert, and one to return the ID back to the .NET application

What gives?  Well it turns out reducing roundtrips was a specific goal in EF Core, and that hasn't been implemented in EF6.

There are some libraries and extension methods out there that can help with this, but I haven't tried them out to be able to recommend one.

## Moving On

Make sure you're not calling `SaveChanges()` more often than necessary.  You might be able to get a speed boost by avoiding time-consuming network roundtrips.  Plus, your DBA will thank you 😀

[1]: https://joshthecoder.com/2019/04/14/orm-queries-lazy-loading.html
[2]: {{ site.url }}/assets/2021-01-25-ef6-four-roundtrips.png
[3]: https://docs.microsoft.com/en-us/ef/core/get-started/overview/first-app?tabs=netcore-cli
[4]: {{ site.url }}/assets/2021-01-25-efcore-four-roundtrips.png
[5]: {{ site.url }}/assets/2021-01-25-efcore-one-roundtrip.png
[6]: https://www.mssqltips.com/sqlservertip/3074/use-caution-with-sql-servers-merge-statement/