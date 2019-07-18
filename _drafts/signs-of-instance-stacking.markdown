---
layout: post
title:  "SOS_SCHEDULER_YIELD as a Sign of Instance Stacking"
categories: 
tags: 
---

It's pretty common advice that running multiple instances of SQL Server on the same Windows install is a Bad Idea™.

The general reason is that it can make troubleshooting difficult.  This is one example.

## The Setup

You have a copy of the 2010 version of the Stack Overflow database running on SQL Server 2019 CTP 3.0.  

Imagine you get a report that this query is running really slowly - it's taking almost 20 seconds!

    SELECT 
        SUM(p.Score) AS Total_Score,
        AVG(p.Score) AS Avg_Score,
        MAX(p.Score) AS Max_Vernon,
        MIN(p.Score) AS Min_Score,
        MAX(votes.Total_Post_Votes) AS Max_Post_Votes
    FROM dbo.Posts p
        INNER JOIN dbo.Users u
            ON u.Id = p.OwnerUserId
        CROSS APPLY
        (
            SELECT COUNT_BIG(v.Id) AS Total_Post_Votes 
            FROM dbo.Votes v 
            WHERE v.PostId = p.Id
        ) votes
    WHERE p.Score > -1
    OPTION (MAXDOP 6);

Who knows what that query means.  Anyway.  It has these supporting indexes:

    CREATE NONCLUSTERED INDEX IX_Score ON dbo.Posts (Score, OwnerUserId);
    CREATE NONCLUSTERED INDEX IX_PostId ON dbo.Votes (PostId);

As a first step, you might take that query and run it against of non-prod copy of the data, which is on a server where nothing else is going on, to get a baseline.  Here's what the execution time stats look like:

     SQL Server Execution Times:
       CPU time = 7829 ms,  elapsed time = 1417 ms.

So it takes just under 1.5 seconds to run, and uses around 7.8 seconds of CPU at DOP 6 - which means the query benefited fairly well from parallelism.

Running the same query on the "production" box (which is the exact same specs) yields these execution time statistics:

     SQL Server Execution Times:
       CPU time = 14031 ms,  elapsed time = 14103 ms.

Our CPU time has doubled, and elapsed time is basically equal to CPU time now.

## Looking at Wait Stats

Since the production query is running so much slower than the baseline, it seems likely that it is *waiting* on something significant on that other server.  To that end, you might run a wait stat snapshot script like the one from Paul Randal here: [Capturing wait statistics for a period of time][1].

Here's a comparison of the wait stats output between the slow and fast versions of this query:

[![screenshot of SSMS wait stat query results][2]][2]



[1]: https://www.sqlskills.com/blogs/paul/capturing-wait-statistics-period-time/
[2]: 