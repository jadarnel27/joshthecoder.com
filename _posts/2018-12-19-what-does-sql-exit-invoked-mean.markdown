---
layout: post
title:  "What Does the sql_exit_invoked XE Mean?"
categories: 
---

## I Like Extended Events

You can do a lot of really cool stuff with them.  But the documentation can leave a bit to the imagination.  Or a lot.

For instance, figuring out something as simple as [the unit being used for duration][1] can even be dicey.

## Enter the sql_exit_invoked Event

I saw this question on Database Administrators Stack Exchange the other day, and it caught my interest:

[What does it means when you have “sql_exit_invoked” in System Health?][2]

I've looked at [the built-in system_health XE session][5] a number of times, but have never really considered that particular event.  So I decided to try and dig a little deeper.

Turns out this is a debug channel event.  If information is sparse about Extended Events in general, the _debug_ channel can be a real wasteland.

The description given in the XE session GUI in SSMS says:

> Occurs when SQLExit() routine is invoked

Too bad we have know way of really knowing what `SQLExit()` is or what it does.  However, from the name it certainly seems to be related to shutting down SQL Server. And in fact, if we look at the event fields, there are only two:

- exit_code
- shutdown_option

There's a nice empty description box next to each of them.  Whatevs.  

"Exit Code" is a pretty standard programming trope, where "0" is good, and anything else is some kind of error.

Querying `sys.dm_xe_map_values` shows there are four values available for the "shutdown_option" field.  So my mission was to see how to get each of those four values.

## Shut It Down

(Did anyone get that 30 Rock reference?  No?  Okay)

First of all, I'll set up an XE session as similar as possible to the one in the system_health session, but with just the `sql_exit_invoked` event:

    CREATE EVENT SESSION [sql_exit_invoked] ON SERVER
    ADD EVENT sqlserver.sql_exit_invoked(
        ACTION(
            package0.callstack,
            sqlserver.client_app_name,
            sqlserver.client_hostname,
            sqlserver.client_pid,
            sqlserver.query_hash,
            sqlserver.session_id,
            sqlserver.session_nt_username)
        )
    ADD TARGET package0.event_file(SET filename=N'sql_exit_invoked')
    WITH (STARTUP_STATE=ON)

And now, I'll try a bunch of different ways of stopping SQL Server.

|What I did|shutdown_option Value|Reaction|
|----------|-------------------------------|--------|
|Restart the SQL Server Service cleanly<br />Restart the machine cleanly|ORDERLY_SHUTDOWN|That makes sense|
|Run `SHUTDOWN;` in SSMS|NICE_SHUTDOWN|Hooooooooow nice|
|Run `SHUTDOWN WITH NOWAIT;`|FAST_SHUTDOWN|It could be faster though|
|Kill the sqlservr.exe process with TaskMgr| |Too fast|
|Restart the machine *not* cleanly<br />(by holding the power button)| |>:(|

There is a 4th option for this field (called "SHUTDOWN_NOT_SET").  I heard from some guy at Microsoft that this is probably just some kind of initial value, and that you wouldn't see it logged in practice.

## How This Helps

While knowing what these shutdown_options mean won't solve all your problems (I mean, your SQL Server instance is restarting), now you can at least have a direction to look in.

- Seeing ORDERLY_SHUTDOWN?  Investigate the Windows Event Logs to see who is restarting the server, or what services are sending a `net stop` command to the SQL Server service
- Seeing NICE_SHUTDOWN or FAST_SHUTDOWN?  Good news: in the default XE, the hostname, app name, and session username are all logged
  - Go track down that user or app and ask them "why are you doing this crazy thing?"  
  - Or better yet, just remove their sysadmin rights, since [that's what's required to run `SHUTDOWN`][3]
- Seeing SHUTDOWN_NOT_SET?  Tell me how you did it!

Here's a screenshot from my test where you can see that "jdarnell" (hey, that's me) is the culprit, and he used SSMS to do it:

![too fast, Clanky][4]

It can also be helpful to know the limitations of the tools you're using.  Now I know that the `sql_exit_invoked` event won't pick up situations where someone forcefully killed the SQL Server process, or hard-rebooted the machine it's running on.

Happy troubleshooting!

[1]: https://dba.stackexchange.com/questions/178168/extended-event-duration-millisecond-or-microsecond
[2]: https://dba.stackexchange.com/questions/224887/what-does-it-means-when-you-have-sql-exit-invoked-in-system-health
[3]: https://docs.microsoft.com/en-us/sql/t-sql/language-elements/shutdown-transact-sql?view=sql-server-2017#permissions
[4]: {{ site.url }}/assets/2018-12-19-fast-shutdown.PNG
[5]: https://docs.microsoft.com/en-us/sql/relational-databases/extended-events/use-the-system-health-session?view=sql-server-2017