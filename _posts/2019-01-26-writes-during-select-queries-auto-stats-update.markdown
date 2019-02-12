---
layout: post
title:  "Writes During SELECT Queries - Auto Stats Update"
categories: 
---

## Seeing Things

I was looking at the output from `sp_WhoIsActive` ([this little guy][1]) the other day while a long `SELECT` query was running, and noticed that the "writes" column had a non-zero number in it.  This seemed odd to me, since my query shouldn't have been writing anything.  But I had a hunch that it might be an auto stats update.

This seemed like a good opportunity to look into the code of Adam Machanic's procedure, which I've never done before.

## Repeating Things

My first stop was attempting to repeat the problem.  So first I went to my local copy of the Stack Overflow database, and dropped all the stats and nonclustered indexes on `dbo.Users`.  Then I ran this query in order to get system-created statistics on the DownVotes column:

    SELECT *
    FROM dbo.Users
    WHERE DownVotes > 5;

This resulted in the creation of a system-generated statistics object named `[_WA_Sys_00000006_3B75D760]`.

![system generated stats][2]

> Fun fact: I recently learned that the "00000006" part of that name is because DownVotes is the sixth ordinal column in that table  

> Fun fact: I tend to play fast and loose with the word "fun"

In order to get the auto-stats update, I'm just going to update every row in the table.  Sue me.

    UPDATE dbo.Users
    SET DownVotes = DownVotes + 1;

This will get the table modification counter high enough that SQL Server decides that stats need to be updated before the next `SELECT`.

So now we just run that same `SELECT` query and check sp_WhoIsActive:

    EXEC master.dbo.sp_WhoIsActive;

![whoisactive showing writes][3]

Wow, 1 write!  Still, seems out of place considering this was a `SELECT` query.  Stats were indeed updated:

![system generated stats - again][4]

Notice that the default sampling rate here (and for the original) was about 19% of the table.

So where does that value for "writes" come from?  For that, we can check the code.

## Adam Machanic's Brainz

As you can imagine, this is a very complex stored procedure.  It's rather well-organized considering how massive it is, so I was quickly able to track down where `[writes]` is selected:

    SELECT TOP(@i)
        sp.session_id,
        ... other columns ...
        COALESCE(r.writes, s.writes) AS writes,

Scrolling a bit further, we can see what `r` and `s` correspond to:

    FROM @sessions AS sp
    LEFT OUTER LOOP JOIN sys.dm_exec_sessions AS s ON
        s.session_id = sp.session_id
        AND s.login_time = sp.login_time
    LEFT OUTER LOOP JOIN sys.dm_exec_requests AS r ON

So Adam is pulling writes straight out of two DMVs: `sys.dm_exec_sessions` and `sys.dm_exec_requests`

## Confirming Suspicions

The Docs aren't extremely verbose on the `[writes]` column in either place.

[sys.dm_exec_sessions (Transact-SQL)][5]  
> writes | bigint | Number of writes performed, by requests in this session, during this session. Is not nullable.

[sys.dm_exec_requests (Transact-SQL)][6]  
> writes | bigint | Number of writes performed by this request. Is not nullable.

But it's really not too tough to confirm that those DMVs will show "writes" to the LOB statistics objects.

I decided to naively spam the DMVs while updating stats manually in order to capture what was happening.  I ran this in one SSMS window:

    SELECT session_id, command, writes FROM sys.dm_exec_requests r WHERE session_id = 54;
    SELECT session_id, writes FROM sys.dm_exec_sessions s WHERE s.session_id = 54;

    GO 100

And then ran this in another window:

    UPDATE STATISTICS dbo.Users(_WA_Sys_00000006_3B75D760)
    WITH SAMPLE 19 PERCENT;

*NOTE: I got "54" by running the query `SELECT @@SPID;` in the query window where I ran the update stats command*

And below is the progression as update stats ran, and then our session's row in `sys.dm_exec_sessions` was updated with one additional write:

![DMVs showing writes][7]

## Concluding

This is just one example of how writes can show up during your *read* queries.  Although this only showed 1 page written, it won't necessarily be that exactly.  I ran the same demo as above, but updated with `FULLSCAN` (rather than sampling 19%) and saw 6 writes in the session.

Have you seen high (non-tempdb) write counts for read queries in `sp_WhoIsActive` (or other monitoring queries)?  Let me know what they were in the comments!

Thanks for stopping by.

[1]: http://whoisactive.com/
[2]: {{ site.url }}/assets/2019-01-26-dbcc-show-stats-initial.PNG
[3]: {{ site.url }}/assets/2019-01-26-whoisactive-writes.PNG
[4]: {{ site.url }}/assets/2019-01-26-dbcc-show-stats-updated.PNG
[5]: https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-sessions-transact-sql?view=sql-server-2017
[6]: https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-requests-transact-sql?view=sql-server-2017
[7]: {{ site.url }}/assets/2019-01-26-dmv-writes-for-session.PNG