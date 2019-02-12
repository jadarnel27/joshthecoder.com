---
layout: post
title:  "Mysterious Parallel Deadlock"
date:   2018-07-05 07:00:00 -0400
categories: 
---
## The Problem
I was working on demo code for [a previous post][6], and noticed that this query consistently deadlocked with itself:

    CREATE DATABASE UnexpectedBlocking;
	GO
    USE UnexpectedBlocking;
    GO
    
    BEGIN TRANSACTION;
    
    SELECT TOP 10000
    	m.message_id, m.[text]
    INTO SomeNewTable
    FROM sys.messages m

The deadlock message looked a bit weird:

> Msg 1205, Level 13, State 78, Line 7  
> Transaction (Process ID 54) was deadlocked on lock | communication buffer resources with another process and has been chosen as the deadlock victim. Rerun the transaction.

But apparently this message is a [common indicator][2] of parallel self-deadlocks, or "intra-query parallel deadlocks."  Sure enough, the problem went away when I added a `MAXDOP 1` hint to the query.

## Some facts
I'm on a machine with 4 logical processors with the default parallelism settings (MAXDOP = 0, Cost Threshold for Parallelism = 5).  This behavior is consistent from SQL Server 2014 onward.  The illustrious [Joe Obbish][5] pointed out to me that parallel `SELECT INTO` was introduced in 2014.

If I leave off the `BEGIN TRANSACTION`, the query executes successfully and has [this query plan][1]:

![works on my machine][3]

Here's [the deadlock graph][4] as well.

## Fruitless investigation
I couldn't wrap my head around why the explicit transaction would cause this query to deadlock with itself.  So I fired up an Extended Events session and see if the call stacks provided any useful information.  I also set a breakpoint in WinDbg on `sqlmin!RaiseDeadlockError` and then triggered the deadlock again.

When my breakpoint hit, there were 6 threads actively working on this query:

- 1 thread where the select query actually begins (Id: 2b28.a9c)
- 1 "coordinator" thread (I'm not positive, but I think this is the one that ends in the RaiseDeadlockError call, Id: 2b28.5e58)
- 4 "DOP" threads

Here are the stacks, trimmed to remove all the boring stuff:

      69  Id: 2b28.a9c Suspend: 1 Teb: 000000b7`19b74000 Unfrozen
     # Child-SP          RetAddr           Call Site
    ...
    0c 000000b7`221fdd50 00007ffa`eec97d5b sqlmin!CQueryScan::GetRow+0x81
    0d 000000b7`221fdd80 00007ffa`eecaa02f sqllang!CXStmtQuery::ErsqExecuteQuery+0x49f
    0e 000000b7`221fdf00 00007ffa`ef8f5a79 sqllang!CXStmtDML::XretDMLExecute+0x3b9
    0f 000000b7`221fdfe0 00007ffa`ef8f5d05 sqllang!CXStmtSelectInto::XretSelectIntoExecute+0x74a
    10 000000b7`221fe200 00007ffa`eec94550 sqllang!CXStmtSelectInto::XretExecute+0x135
    11 000000b7`221fe230 00007ffa`eec93fb3 sqllang!CMsqlExecContext::ExecuteStmts<1,1>+0x4c5
    12 000000b7`221fe380 00007ffa`eec935f4 sqllang!CMsqlExecContext::FExecute+0xaae
    13 000000b7`221fe6b0 00007ffa`eec9ccb5 sqllang!CSQLSource::Execute+0xa2c
    ...

    # 86  Id: 2b28.5e58 Suspend: 1 Teb: 000000b7`19bf9000 Unfrozen
     # Child-SP          RetAddr           Call Site
    00 000000b7`243fc738 00007ffa`cffcc051 sqlmin!RaiseDeadlockError
    01 000000b7`243fc740 00007ffa`cf7e935e sqlmin!CXPacketList::RemoveHead+0x175
    02 000000b7`243fc830 00007ffa`cf7e929d sqlmin!CXPipe::ReceivePacket+0x82
    03 000000b7`243fc870 00007ffa`cf7e916b sqlmin!CXTransLocal::ReceiveBuffers+0x2d
    04 000000b7`243fc8a0 00007ffa`cf7e8f00 sqlmin!CQScanExchangeNew::GetRowFromProducer+0x5e
    05 000000b7`243fc8d0 00007ffa`cf6fae66 sqlmin!CQScanExchangeNew::GetRowHelper+0x6c
    06 000000b7`243fc900 00007ffa`cf7e3d26 sqlmin!CQScanUpdateNew::GetRow+0xc6
    07 000000b7`243fc9b0 00007ffa`cf7e4115 sqlmin!CQScanXProducerNew::GetRowHelper+0x386
    08 000000b7`243fca20 00007ffa`cf7e40c4 sqlmin!CQScanXProducerNew::GetRow+0x15
    09 000000b7`243fca50 00007ffa`cf7e491c sqlmin!FnProducerOpen+0x5b
    0a 000000b7`243fca90 00007ffa`cf7e5748 sqlmin!FnProducerThread+0x757
    ...

      29  Id: 2b28.47e0 Suspend: 1 Teb: 000000b7`19bc5000 Unfrozen
     # Child-SP          RetAddr           Call Site
    ...
    07 000000b7`1e5fba20 00007ffa`cf7e732e sqlmin!CXPipe::Pull+0x162
    08 000000b7`1e5fcdf0 00007ffa`cf7e3eb1 sqlmin!CXTransLocal::AllocateBuffers+0x64
    09 000000b7`1e5fce20 00007ffa`cf7e8c26 sqlmin!CQScanXProducerNew::AllocateBuffers+0x31
    0a 000000b7`1e5fce50 00007ffa`cf7e4115 sqlmin!CQScanXProducerNew::GetRowHelper+0x2b7
    0b 000000b7`1e5fcec0 00007ffa`cf7e40c4 sqlmin!CQScanXProducerNew::GetRow+0x15
    0c 000000b7`1e5fcef0 00007ffa`cf7e491c sqlmin!FnProducerOpen+0x5b
    0d 000000b7`1e5fcf30 00007ffa`cf7e5748 sqlmin!FnProducerThread+0x757
    ...
    
      60  Id: 2b28.63d8 Suspend: 1 Teb: 000000b7`19b62000 Unfrozen
     # Child-SP          RetAddr           Call Site
    ...
    11 000000b7`205fcbd0 00007ffa`cf6f0bf0 sqlmin!RowsetNewSS::InsertRow+0x26
    12 000000b7`205fcc00 00007ffa`fb671ec7 sqlmin!CValRow::SetDataX+0x5b
    13 000000b7`205fcc40 00007ffa`cf6faf2a sqlTsEs!CEsExec::GeneralEval4+0xe7
    14 000000b7`205fcd10 00007ffa`cf7e3b13 sqlmin!CQScanUpdateNew::GetRow+0x516
    15 000000b7`205fcdc0 00007ffa`cf7e4115 sqlmin!CQScanXProducerNew::GetRowHelper+0x63
    16 000000b7`205fce30 00007ffa`cf7e40c4 sqlmin!CQScanXProducerNew::GetRow+0x15
    17 000000b7`205fce60 00007ffa`cf7e491c sqlmin!FnProducerOpen+0x5b
    18 000000b7`205fcea0 00007ffa`cf7e5748 sqlmin!FnProducerThread+0x757
    ...
    
      66  Id: 2b28.69c0 Suspend: 1 Teb: 000000b7`19b6e000 Unfrozen
     # Child-SP          RetAddr           Call Site
    ...
    11 000000b7`21bfce70 00007ffa`cf6f0bf0 sqlmin!RowsetNewSS::InsertRow+0x26
    12 000000b7`21bfcea0 00007ffa`fb671ec7 sqlmin!CValRow::SetDataX+0x5b
    13 000000b7`21bfcee0 00007ffa`cf6faf2a sqlTsEs!CEsExec::GeneralEval4+0xe7
    14 000000b7`21bfcfb0 00007ffa`cf7e3b13 sqlmin!CQScanUpdateNew::GetRow+0x516
    15 000000b7`21bfd060 00007ffa`cf7e4115 sqlmin!CQScanXProducerNew::GetRowHelper+0x63
    16 000000b7`21bfd0d0 00007ffa`cf7e40c4 sqlmin!CQScanXProducerNew::GetRow+0x15
    17 000000b7`21bfd100 00007ffa`cf7e491c sqlmin!FnProducerOpen+0x5b
    18 000000b7`21bfd140 00007ffa`cf7e5748 sqlmin!FnProducerThread+0x757
    ...
    
      78  Id: 2b28.57fc Suspend: 1 Teb: 000000b7`19b8f000 Unfrozen
     # Child-SP          RetAddr           Call Site
    ...
    11 000000b7`233fcc50 00007ffa`cf6f0bf0 sqlmin!RowsetNewSS::InsertRow+0x26
    12 000000b7`233fcc80 00007ffa`fb671ec7 sqlmin!CValRow::SetDataX+0x5b
    13 000000b7`233fccc0 00007ffa`cf6faf2a sqlTsEs!CEsExec::GeneralEval4+0xe7
    14 000000b7`233fcd90 00007ffa`cf7e3b13 sqlmin!CQScanUpdateNew::GetRow+0x516
    15 000000b7`233fce40 00007ffa`cf7e4115 sqlmin!CQScanXProducerNew::GetRowHelper+0x63
    16 000000b7`233fceb0 00007ffa`cf7e40c4 sqlmin!CQScanXProducerNew::GetRow+0x15
    17 000000b7`233fcee0 00007ffa`cf7e491c sqlmin!FnProducerOpen+0x5b
    18 000000b7`233fcf20 00007ffa`cf7e5748 sqlmin!FnProducerThread+0x757
    ...

The takeaway here is that this looks like a normal parallel query.  

# Punting

The indomitable [Paul White][7] pointed out to me that this behavior is likely due to the streaming UDF that underlies `sys.messages` violating some internal assumptions around locking - other similarly implemented system views (like `sys.dm_os_buffer_descriptors`) exhibit this same problem.

As this appears to be a bug, I have filed an issue on the feedback site about it:

[Parallel SELECT INTO from sys.messages causes intra-query deadlock][8]

[1]: https://www.brentozar.com/pastetheplan/?id=rkRJMNQzm
[2]: https://dba.stackexchange.com/a/72170/6141
[3]: {{ site.url }}/assets/draft-parallel-query-plan.png
[4]: {{ site.url }}/assets/draft-parallel-deadlock-graph.xml
[5]: https://orderbyselectnull.com/
[6]: {{ site.baseurl }}{% post_url 2018-06-29-locks-on-system-tables %}
[7]: https://sqlperformance.com/author/paulwhitenzgmail-com
[8]: https://feedback.azure.com/forums/908035-sql-server/suggestions/34708300-parallel-select-into-from-sys-messages-causes-intr