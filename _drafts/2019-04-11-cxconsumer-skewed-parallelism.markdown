---
layout: post
title:  "CXCONSUMER Can Be a Sign of Skewed Parallelism"
categories: 
tags: 
---

## What does CXCONSUMER really mean?

For reference, here's the description from the Microsoft Docs:

> Occurs with parallel query plans when a consumer thread waits for a producer thread to send rows. This is a normal part of parallel query execution.

This wait was added (SQL Server 2016 SP2, SQL Server 2017 CU3) in order to try and make CXPACKET waits more actionable - these should be "benign" parallelism waits.

I've been curious about the CXCONSUMER wait type since I read [Erik's blog post about it][1], as well as a [couple][2] of [questions][3] on Database Administrators Stack Exchange that touched on it.  

The common theme was skewed parallelism, so I decided to try and learn a little about when and where these waits are posted in queries that suffer from this particular malady.

## A Bad Query™

Some might describe this query as not very realistic:

    SELECT * 
    FROM dbo.PostTypes pt
        INNER LOOP JOIN dbo.Posts p
            ON p.PostTypeId = pt.Id
        INNER JOIN dbo.Users u
            ON u.DisplayName = p.LastEditorDisplayName
    WHERE pt.[Type] = 'TagWiki';

With a warm cache, this takes about 2 seconds on my laptop, and 0 rows are returned.  This is what the wait stats look like on a typical run (from `sys.dm_exec_session_wait_stats`):

|session_id|wait_type|waiting_tasks_count|wait_time_ms|max_wait_time_ms|signal_wait_time_ms|
|----------|---------|-------------------|------------|----------------|-------------------|
|53|CXCONSUMER|40294|6576|1116|1159|
|53|CXPACKET|37856|2379|1141|761|
|53|MEMORY_ALLOCATION_EXT|10127|16|6|0|
|53|SOS_SCHEDULER_YIELD|366|1|0|1|
|53|LATCH_EX|5|0|0|0|
|53|EXECSYNC|1|0|0|0|
|53|RESERVED_MEMORY_ALLOCATION_EXT|652|0|0|0|
|53|SESSION_WAIT_STATS_CHILDREN|1|0|0|0|

6.5 seconds of CXCONSUMER waits seems like a lot for a 2 second query at DOP 4.

> Note: adding to the lack of realistic-ness of this query is the fact that I accidentally ran it at compatability level 100.  But I'm just gonna go with it.

## A Brief Tour of the Execution Plan

[![screenshot of execution plan][4]][4]

What makes this query so bad?

I'm forcing the join type, and implicitly forcing the join order, resulting in only one row coming into the outer input of the initial nested loops join.  Even though the query is parallel, this causes all the matching rows to land one one thread - the thread with the single "TagWiki" row in PostTypes.

Tag Wikis are one of the least common types of posts, totaling 507 rows.  But there are no indexes to support this query, so all 3.7 million rows in the Posts table are scanned (which is also done serially, despite being a parallel scan).

So where does CXCONSUMER come into play here?

## Extended events

I created this extended events session to capture waits occurring, scoped specifically to the session where I ran the query above:

    CREATE EVENT SESSION [waits] ON SERVER 
    ADD EVENT sqlos.wait_completed(
        ACTION(package0.callstack,sqlos.scheduler_id,sqlos.system_thread_id,sqlos.task_address,sqlos.worker_address)
        WHERE (
            ([package0].[equal_uint64]([sqlserver].[session_id],(53))) AND (([duration]>(0)) OR ([signal_duration]>(0))))),
    ADD EVENT sqlos.wait_info(
        ACTION(package0.callstack,sqlos.scheduler_id,sqlos.system_thread_id,sqlos.task_address,sqlos.worker_address)
        WHERE (
            ([package0].[equal_uint64]([sqlserver].[session_id],(53)))))
    ADD TARGET package0.event_file(SET filename=N'waits')
    WITH (STARTUP_STATE=OFF)
    GO

Parsing through that event file with terrible XML queries, I can see long CXCONSUMER waits in the wait_completed event here:

|ts|event_name|wait_type|duration|signal_duration|system_thread_id|scheduler_id|worker_address|task_address|
|--|----------|---------|--------|---------------|----------------|------------|--------------|------------|
|2019-04-11 02:42:51.900|wait_completed|CXCONSUMER|2151|0|10156|2|0x000002895bcfe160|0x00000289da04eca8|

This is the callstack captured with that event:

    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc56c 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc47e 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc25a 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc2be 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0x7f6c 
    sqldk.dll!SOS_Scheduler::PromotePendingTask+0x204 
    sqldk.dll!SOS_Task::PostWait+0x5f 
    sqldk.dll!SOS_Scheduler::Suspend+0xb15 
    sqldk.dll!SOS_PartitionedHeap::Free+0x408 
    sqlmin.dll!CRiLeaf::FIdentifiersOnly+0x109d 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x26be 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x25fd 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x24cc 
    sqlmin.dll!SubprocEntrypoint+0x62f0 
    sqlmin.dll!BPool::Discard+0x5acb 
    sqlmin.dll!TableInfo::TableInfo+0x36ed 
    sqlmin.dll!BPool::Discard+0x5acb 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0xeef 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x128a 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x3dde 
    sqlmin.dll!BPool::Discard+0x5d41 
    sqlmin.dll!DatasetSession::Create+0x4a51 
    sqlmin.dll!SubprocEntrypoint+0x66c6 
    sqlmin.dll!CRiLeaf::FIdentifiersOnly+0xe11


Since this fired at 51.900, and had a duration of 2151, I should be able to find the wait_info entry at 49.749.  I found one for the same system_thread_id and task_address at 49.750, which is just be due to the weirdness of datetime rounding in SQL Server:

|ts|event_name|wait_type|duration|signal_duration|system_thread_id|scheduler_id|worker_address|task_address|
|--|----------|---------|--------|---------------|----------------|------------|--------------|------------|
|2019-04-11 02:42:49.750|wait_info|CXCONSUMER|0|0|10156|2|0x000002895bcfe160|0x00000289da04eca8|

This is the callstack captured with that event:

    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc56c 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc47e 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc25a 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0xc2be 
    sqldk.dll!SOS_DispatcherBase::GetTrack+0x7d05 
    sqldk.dll!SOS_Task::PreWait+0x136 
    sqldk.dll!SOS_Scheduler::Suspend+0xae1 
    sqldk.dll!SOS_PartitionedHeap::Free+0x408 
    sqlmin.dll!CRiLeaf::FIdentifiersOnly+0x109d 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x26be 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x25fd 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x24cc 
    sqlmin.dll!SubprocEntrypoint+0x62f0 
    sqlmin.dll!BPool::Discard+0x5acb 
    sqlmin.dll!TableInfo::TableInfo+0x36ed 
    sqlmin.dll!BPool::Discard+0x5acb 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0xeef 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x128a 
    sqlmin.dll!AutoInstallSubprocessMgr::~AutoInstallSubprocessMgr+0x3dde 
    sqlmin.dll!BPool::Discard+0x5d41 
    sqlmin.dll!DatasetSession::Create+0x4a51 
    sqlmin.dll!SubprocEntrypoint+0x66c6 
    sqlmin.dll!CRiLeaf::FIdentifiersOnly+0xe11 
    sqlmin.dll!FnProducerThread+0x5c2

I thought it was interesting that FnProducerThread is at the root of this stack, since the wait being registered is CXCONSUMER.  However, this is likely unimportant, since the stack captured is purely dependent on when / where the SQL Server code is designed to fire the XE.

So I've found one of the tasks generating CXCONSUMER waits.  How can I find out more information about it?

## Waiting Tasks

Thanks to the suggestion of some New Zealander you've never heard of, I decided to look in `sys.dm_os_waiting_tasks` while this query was running.

To do that, I started the code below in another query window right before executing the bad query, and cancelled it when the query was done:

    DROP TABLE IF EXISTS #waiting_tasks;

    SELECT TOP 0 ts = SYSUTCDATETIME(), *
    INTO #waiting_tasks
    FROM sys.dm_os_waiting_tasks;
    GO

    INSERT INTO #waiting_tasks
    SELECT ts = SYSUTCDATETIME(), *
    FROM sys.dm_os_waiting_tasks
    WHERE session_id = 56;
    GO 10000

This produced about 9,000 rows of waiting task information.  The closest CXCONSUMER wait to 49.750 with that task address starts here:

|ts|waiting_task_address|session_id|exec_context_id|wait_duration_ms|wait_type|resource_address|blocking_task_address|blocking_session_id|blocking_exec_context_id|
|--|--------------------|----------|---------------|----------------|---------|----------------|---------------------|-------------------|------------------------|
|2019-04-11 02:42:49.7540572|0x00000289DA04ECA8|56|4|5|CXCONSUMER|0x000002883A67B7E0|0x0000028873756CA8|56|7|

Entries exactly like this continue to show up in the results, with duration increasing all the way to 2151:

|ts|waiting_task_address|session_id|exec_context_id|wait_duration_ms|wait_type|resource_address|blocking_task_address|blocking_session_id|blocking_exec_context_id|
|--|--------------------|----------|---------------|----------------|---------|----------------|---------------------|-------------------|------------------------|
|2019-04-11 02:42:51.8980533|0x00000289DA04ECA8|56|4|2151|CXCONSUMER|0x000002883A67B7E0|0x0000028873756CA8|56|7|

This is definitely the same wait as the one we found in the XE.

The "resource_description" column probably has the most interesting information in it:

    exchangeEvent 
    id=Pipe289aeab1400 
    WaitType=e_waitPipeGetRow 
    waiterType=Consumer 
    nodeId=3 
    tid=3 
    ownerActivity=sentData 
    waiterActivity=needMoreData 
    merging=false 
    spilling=false 
    waitingToClose=false

Maybe stating this obvious, but this is a consumer thread, and it needs more data from the producer thread.  So let's zoom in a bit on that part of the plan.

## Waiting for Rows to Repartition

Node ID 3 in the execution plan is the Repartition Streams operator to the left of the parallel nested loops join.  The "Actual Elapsed Time" for that operator in the execution plan is 2220 ms.  Note that this is cumulative up to this point in the plan, so this roughly adds up to the end of the waits we're discussing.

[![zoomed in portion of execution plan][5]][5]

The tid=3 represents thread id 3 in the execution plan.  Threads 1 and 3 only got 2 rows each from the 507 rows that came out of the NL join.  Threads 2 and 4 got more rows, although they also registered significant wait times during the times between getting rows.  Here's a breakdown of rows and threads for this operator in Plan Explorer:

[![rows and threads][6]][6]

Using this information, I can create a timeline of waits being registered by threads on the consumer (right) side of the Repartition Streams:

|tid|started|ended|duration|
|---|-------|-----|--------|
|1|49.7540572|51.9660535|2213|
|2|49.7540572|51.5220547|1775|
|2|51.5220547|51.9660535|Lots of very short waits|
|3|49.7540572|51.8980533|2151|
|3|51.9060622|51.9660535|66|
|4|49.7540572|51.5220547|1776|
|4|51.5260546|51.9660535|Lots of slightly longer waits|

For a more visualized representation, here's a graph!  Each line is a thread, with the Y-axis representing the current CXCONSUMER wait duration at a given time, and the X-axis is time.  This is scoped specifically to node 3, and ignores thread 0 (the coordinator thread).

[![threads and waits][7]][7]

This demonstrates pretty clearly that threads that are attached to the consumer side of the Repartition Streams operator are registering CXCONSUMER waits while waiting on rows from the join operator.  The producer threads are sending rows as quick as they can from scan of the 3.7 million rows in the Posts table, so very few CXPACKET waits are registered.

This also demonstrates that CXCONSUMER, in this case, is not benign at all - but a sign that we have a query in need of tuning.

Other CXCONSUMER waits are registered for node 10 (also repartition streams) on all 4 threads from 2019-04-11 02:42:51.9740573 to 2019-04-11 02:42:52.0460541.

## Aside: About the Coordinator Thread

There is a very long CXPACKET wait that accumulates on the coordinator thread from 2019-04-11 02:42:49.7460533 until 2019-04-11 02:42:51.9700543 (2224 ms) with a waiterType of "waitForAllOwnersToOpen."  It seems this is accumulating up until all parallel branches in the plan have "started" (for lack of a better term).

There is a CXCONSUMER wait that accumulates on the coordinator thread from 2019-04-11 02:42:51.9740573 to 2019-04-11 02:42:52.0460541 (71 ms).  This is the same time period where CXCONSUMER threads are being registered node 10.  I'm speculating here, but it seems like, once all parallel branches have started, the coordinator thread registers CXCONSUMER until parallelism ends.

## Look Out for CXCONSUMER

This wait type can definitely be a sign that something strange is going on in your queries.  Look out for skewed parallelism - particularly in cases like this, where a parallel exchange operator is active for a long time waiting on a long-runnig operator to send it data.  Please let me know if you see other problematic queries that have high CXCONSUMER waits as well, I'd be interested in checking them out!

[1]: https://www.brentozar.com/archive/2018/07/cxconsumer-is-harmless-not-so-fast-tiger/
[2]: https://dba.stackexchange.com/q/226366/6141
[3]: https://dba.stackexchange.com/q/233536/6141
[4]: {{ site.url }}/assets/2019-04-11-execution-plan.PNG
[5]: {{ site.url }}/assets/2019-04-11-parallel-branch.PNG
[6]: {{ site.url }}/assets/2019-04-11-thread-distribution.PNG
[7]: {{ site.url }}/assets/2019-04-11-node-3-consumer-waits-by-thread.PNG