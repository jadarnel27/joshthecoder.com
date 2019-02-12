---
layout: post
title:  "Locks on System Tables"
date:   2018-06-29 08:20:00 -0400
categories: 
---

I was working with an ETL process recently, and noticed that an unrelated monitoring query was blocked for a while by this process.

Consider some T-SQL code like this:

    CREATE DATABASE UnexpectedBlocking;
    USE UnexpectedBlocking;
    GO
    
    BEGIN TRANSACTION;
    
    SELECT TOP 10000
    	m.message_id, m.[text]
    INTO SomeNewTable
    FROM sys.messages m
    OPTION (MAXDOP 1);

In another SSMS window, run this query:

    SELECT * 
    FROM UnexpectedBlocking.sys.allocation_units;

The second query will be blocked until the first transaction is either committed or rolled back.

Running `EXEC sp_WhoIsActive @get_locks=1;` shows that the first query takes many, many locks on system tables.  From the "locks" column:

    <Database name="UnexpectedBlocking">
      <Locks>
        <Lock request_mode="S" request_status="GRANT" request_count="1" />
      </Locks>
      <Objects>
        <Object name="(null)">
          <Locks>
            <Lock resource_type="DATABASE.DDL" request_mode="S" request_status="GRANT" request_count="1" />
            <Lock resource_type="METADATA.DATA_SPACE" resource_description="data_space_id = 1" request_mode="Sch-S" request_status="GRANT" request_count="1" />
          </Locks>
        </Object>
        <Object name="SomeNewTable" schema_name="dbo">
    		...
        </Object>
        <Object name="sysallocunits" schema_name="sys">
    		...
        </Object>

The locks continued with several other tables in the `sys` schema:  `syscolpars`, `sysidxstats`, `sysrowsets`, `sysrscols`, and `sysschobjs`.

Intuitively it makes sense that SQL Server would need to take locks when updating these system tables.  I just didn't realize that the metadata tables were updated in real-time, and that the locks would be taken as part of a user transaction.

---

The moral of the story?  Make sure you're not leaving transactions open for a long time - especially with schema changes.  

Or...make sure to put `WITH NOLOCK` on your monitoring queries ;-)

Thanks for stopping by!