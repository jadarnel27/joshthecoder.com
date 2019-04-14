---
layout: series
title:  "ORM Queries: SELECTing All Columns"
categories: 
tags: [ORM Queries]
---

## Not Exactly SELECT *

One thing we're told early and often is to never use `SELECT *` in production.

I'm not aware of any ORM that actually uses `SELECT *` directly, but the default behavior for most is to select every column in the table (enumerating the whole list of columns).

## An Example

I'm going to use the Stack Overflow database as an example.  Let's say I'm asked to show a leaderboard of the top 10 users and their reputation score.

Here's the EF code in a small console application:

    private static void Main(string[] args)
    {
        using (var db = new BloggingContext())
        {
            var users = db.StackOverflowUsers
                .Take(10)
                .ToList();

            Console.WriteLine("User\t\t\tReputation");
            Console.WriteLine("==================================");

            foreach (var user in users)
            {
                Console.WriteLine($"{user.DisplayName}\t\t{user.Reputation:##,###}");
            }

            Console.ReadLine();
        }
    }

And the output:

![screenshot of console output][1]

And here's the query that was generated:

    SELECT TOP (10)
        [Extent1].[Id] AS [Id],
        [Extent1].[AboutMe] AS [AboutMe],
        [Extent1].[Age] AS [Age],
        [Extent1].[CreationDate] AS [CreationDate],
        [Extent1].[DisplayName] AS [DisplayName],
        [Extent1].[DownVotes] AS [DownVotes],
        [Extent1].[EmailHash] AS [EmailHash],
        [Extent1].[LastAccessDate] AS [LastAccessDate],
        [Extent1].[Location] AS [Location],
        [Extent1].[Reputation] AS [Reputation],
        [Extent1].[UpVotes] AS [UpVotes],
        [Extent1].[Views] AS [Views],
        [Extent1].[WebsiteUrl] AS [WebsiteUrl],
        [Extent1].[AccountId] AS [AccountId]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    ORDER BY [Extent1].[Reputation] DESC

## How'd That Go?

This query scans the whole clustered index, goes parallel, sorts on reputation, and does 7,691 logical reads against the users table.

![screenshot of scan + sort execution plan with all columns][2]

It's...not awesome.

## We Can Do Better Though

Just because Entity Framework *defaults* to selecting all the columns doesn't mean we *have to* select them.

I can use the `Select(...)` extension method to define exactly what columns I want back:

    var users = db.StackOverflowUsers
        .OrderByDescending(u => u.Reputation)
        .Take(10)
        .Select(u => new { u.DisplayName, u.Reputation })
        .ToList();

Which becomes:

    SELECT TOP (10)
        [Extent1].[Reputation] AS [Reputation],
        [Extent1].[DisplayName] AS [DisplayName]
    FROM [dbo].[StackOverflowUsers] AS [Extent1]
    ORDER BY [Extent1].[Reputation] DESC

If I run that side by side with the other query, we can see that it is *much* less expensive, since it doesn't have to pass these huge columns around throughout the execution plan:

![screenshot of execution plan with all columns alongside smaller plan][3]

Looking at `STATISTICS TIME` between the two queries

- CPU time dropped from 733 ms to 220 ms
- Elapsed time dropped from  372 ms to 202 ms

That's a pretty big improvement, and all we did was add one line of EF code!

## Getting Even Better (Outside EF)

Being an enterprising young developer, I asked the DBA team create this index for my little project:

    CREATE INDEX IX_Reptuation
    ON dbo.StackOverflowUsers (Reputation DESC)
    INCLUDE (DisplayName);

![screenshot of execution plan with new index][4]

No sort, just a scan and a top!  

CPU and Elapsed time are reported as "0" (down from 733 and 220 originally).  Logical reads is down to 3 (from 7,691).

Who says Entity Framework writes bad queries?  This one is blazing fast =P

## Why Is It The Default Though?

Most of the time, developers want to have the flexibility to pull "entities" (rows) out of a table and have immediate access to any and all properties (columns) on it.  This makes writing code fast and simple - all the information about this user is at your fingertips!  

This makes selecting all columns a pretty reasonable default for Entity Framework - a tool that is supposed to increase developer productivity when working with databases.

## What To Do About This

Sometimes you really need all the columns.  If there's a page where a user can view and edit all of their details, you're probably going to have to get most or all of the columns in the users table.

If you're working on a report, dashboard, search page, leaderboard, etc - consider what columns you are actually using, and add a `Select(...)` projection to limit what gets pulled back from SQL Server.  In my example above, I used an anonymous type.  But I could have created a "view model" class like `public class LeaderboardDetail` that just had those two properties I needed.

Happy ORMing!

[1]: {{ site.url }}/assets/2019-02-14-ten-users-with-rep.PNG
[2]: {{ site.url }}/assets/2019-02-14-scan-sort-plan.PNG
[3]: {{ site.url }}/assets/2019-02-14-small-scan-sort-plan.PNG
[4]: {{ site.url }}/assets/2019-02-14-small-scan-top-plan.PNG