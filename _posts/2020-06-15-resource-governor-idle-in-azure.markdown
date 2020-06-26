---
layout: post
title:  "RESOURCE_GOVERNOR_IDLE in Azure"
categories: 
tags: 
---

Occasionally, you might see a query running on Azure SQL Database run inexplicably slowly.  I've seen a couple of questions on Database Administrators Stack Exchange recently that started out this way ([one][1], [two][2]), so I thought it would be worthwhile to blog about it here.

## The Test Query

I ran this query against an Azure SQL Database I have access to (after checking "Discard results after execution" in SSMS):

    SELECT TOP (5000000) 1
    FROM sys.all_objects o1
    CROSS JOIN sys.all_objects o2
    CROSS JOIN sys.all_objects o3;

The point is to read 5,000,000 rows, it doesn't matter much how.  I discarded the results in order to avoid SSMS causing `ASYNC_NETWORK_IO` waits while rendering millions of 1's.

## Timing

The execution plan XML shows these timing characteristics:

    <QueryTimeStats CpuTime="1298" ElapsedTime="7029" />

Usually it's not a good sign when I see that CPU time (1.3 seconds or so) is much less than elapsed time (7 seconds).

For comparison, I ran the same query on my local SQL Server 2019 instance:

    <QueryTimeStats CpuTime="2230" ElapsedTime="2259" />

The CPU time is 1 second higher, but elapsed time and CPU time are right in line (around 2.2 seconds).

So what was the Azure SQL Database query doing for those 5+ extra seconds?

## In Walks the RESOURCE_GOVERNOR_IDLE Wait Type

With a big gap between CPU and elapsed time, it's often worthwhile to check wait statistics.  If the query was running, but not using CPU, it seems reasonable that it was waiting on *something.*  Normally, with on-prem SQL Server, you'd have to check [`sys.dm_os_wait_stats`][3], and take a diff of the cumulative values before and after.

However, thanks to (relatively) recent enhancements to execution plans (which keep getting better and better!), we can see a subset of what resources the query waited on right in the plan.

Looking at the plan from my Azure query, here's what I see:

    <Wait WaitType="SOS_SCHEDULER_YIELD" WaitTimeMs="5733" WaitCount="323" />
    <Wait WaitType="RESOURCE_GOVERNOR_IDLE" WaitTimeMs="5545" WaitCount="430" />

Notice that there were 5.5 seconds of `RESOURCE_GOVERNOR_IDLE` waits during this query.  That explains the 5 second gap in CPU and elapsed time.  But what does it mean?

## Resources in Azure

My go to resources for the meaning of wait stats are:

- [Paul Randal's library][4]
- [the documentation][3]

Unfortunately, there's not much in either location ("*TBD*" and "*Internal use only*", respectively).  I've emailed Paul about potentially updating the page in his wait stats library.

---

**UPDATE 2020-06-26:** Paul has updated that wait stats library with information from the MS blog (mentioned below) and this post - thanks, Paul!

---

However, some Googling brought me to this 2015 Microsoft blog post:

[What is RESOURCE_GOVERNOR_IDLE and why you should not ignore it completely][5]

That post has this incredibly valuable nugget of information:

> This wait type is related to resource governor CPU cap implementation (CAP_CPU_PERCENT).     When you enable CAP_CPU_PERCENT for a resource pool, SQL Server ensures that pool won’t exceed the CPU cap.   If you configure 10% for CAP_CPU_PERCENT, SQL Server ensures that you only use 10% of the CPU for the pool.  If you pound the server (from that pool) with CPU bound requests, SQL Server will insert ‘idle consumer’ into runnable queue to take up the quantum that pools is not entitled to.   While the ‘idle consumer’ is waiting, we put RESOURCE_GOVERNOR_IDLE to indicate that the ‘idle consumer’ is taking up quantum

Based on that, it looks like the CPU / DTU limits of the different Azure service tiers are implemented in the same way - using resource governor.

In the case of this test query, I was using a [the lowest tier (basic)][6], and the wait type is an indication that my access to the CPU is being throttled (**emphasis** mine):

> The Basic service tier provides **less than one vCore (CPU)**. For CPU-intensive workloads, a service tier of S3 or greater is recommended.

## What About That SOS_SCHEDULER_YIELD?

You may notice that these `RESOURCE_GOVERNOR_IDLE` are often paired with `SOS_SCHEDULER_YIELD` waits of similar length.  If the query isn't encountering other bottlenecks (like lock or I/O waits), then it will incur `SOS_SCHEDULER_YIELD` waits at the same time as the "idle consumer" is "running" (and racking up `RESOURCE_GOVERNOR_IDLE` waits).

## So What?

When you've got a slow query, it's tempting to dive right in and try tuning it (query rewrites, indexes, etc).  This is exactly what happened with the two DBA.SE questions I linked to at the beginning of this post.  

In the case of Azure SQL Database, be on the lookout for `RESOURCE_GOVERNOR_IDLE` waits as a sign that you may need to invest in moving to a higher tier with access to more vCores / DTUs.  

For my example query, more than 75% of the query's runtime is spent being throttled by the service tier.  You can tune the other 25% all you want, but eventually you'll have "tune" the 75% - with your wallet 😜

[1]: https://dba.stackexchange.com/q/264712/6141
[2]: https://dba.stackexchange.com/q/266647/6141
[3]: https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-os-wait-stats-transact-sql?view=sql-server-ver15
[4]: https://www.sqlskills.com/help/waits/resource_governor_idle/
[5]: https://techcommunity.microsoft.com/t5/sql-server-support/what-is-resource-governor-idle-and-why-you-should-not-ignore-it/ba-p/318555
[6]: https://docs.microsoft.com/en-us/azure/azure-sql/database/resource-limits-dtu-single-databases#basic-service-tier