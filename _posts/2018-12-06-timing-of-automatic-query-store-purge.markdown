---
layout: post
title:  "Timing of the Automatic Query Store Purge"
categories: 
---

## Keeping things tidy

One of the [Best Practices for using the Query Store feature][1] introduced in SQL Server 2016 is to make sure you're only keeping _relevant_ data:

> Keep the most relevant data in Query Store
> Configure the Query Store to contain only the relevant data and it will run continuously providing great troubleshooting experience with a minimal impact on your regular workload.

It goes on to list three specific settings to help accomplish this:

- `QUERY_CAPTURE_MODE` - set this to `AUTO` to filter queries that are unimportant based on internal heuristics related to execution count, and execution / compilation duration.  The default value for SQL Server 2016 and 2017 is `ALL` but you can run this command to change it:

    ALTER DATABASE YourDatabaseName
    SET QUERY_STORE (QUERY_CAPTURE_MODE = AUTO);

- `STALE_QUERY_THRESHOLD_DAYS` - set this to an integer value to have queries automatically be removed from the Query Store after that many days:

    ALTER DATABASE YourDatabaseName
    SET QUERY_STORE (CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30));

- `SIZE_BASED_CLEANUP_MODE` - set this to `AUTO` to have the oldest, and least resource intensive, queries deleted automatically when the data stored in the Query Store starts to approach the configured `MAX_STORAGE_SIZE_MB`

    ALTER DATABASE YourDatabaseName
    SET QUERY_STORE (
        MAX_STORAGE_SIZE_MB = 1024,
        SIZE_BASED_CLEANUP_MODE = AUTO);

## Lack of control

One thing I thought was interesting is that there is no way to configure _when_ the time-based cleanup (`STALE_QUERY_THRESHOLD_DAYS`) occurs.

While answering [this question on Database Administrators Stack Exchange][2], I was made aware of a pair of extended events that fires whenever the cleanup starts and ends:

- `query_store_db_cleanup__started`
- `query_store_db_cleanup__finished`

So I thought I'd fire up those extended events and see what I could find out.

## Not documented

Here are the handful of things I discovered about the time-based automated cleanup process in my testing:

- The cleanup happens about every 24 hours, give or take a few seconds
  - This may seem obvious, since the setting is `STALE_QUERY_THRESHOLD_DAYS`, but it's not explicitly called out anywhere I've seen
- The _initial_ cleanup is not quite as predictable.  It appears to run anywhere from 15-30 minutes after the database comes online.  This was true in all the scenarios I tested:
  - the Query Store being enabled for the first time in the database
  - The SQL Server service starting up after a reboot
  - A backup of a database with Query Store already enabled being restored
  - the Query Store being disabled and re-enabled in a database
- The data that's deleted is based on the calendar day that's X days before the current day.  In other words, it's not based on a rolling 24 hours from when the cleanup runs
  - In the example from my DBA Stack Exchange answer, you can see that the purge running on October 3rd deleted all of the Query Store data for August 3rd (my system was configured to retain 60 days of history)

A bonus tidbit I learned related to the Extended Events mentioned above: these events do not fire at all of there is no data to be purged.  It would be nice if this were documented somewhere.

## In conclusion

At this point you might be saying, "Josh, why does this matter?"  Well, that's a fair question, and it probably doesn't.  Although the delete queries that purge the data run in the user database, it seems unlikely in practice that it should interfere with your production workloads.

One exception to that rule is if you accumulate large amounts of query store data in a given day.  Then the cleanup process hits that date, you could have a pretty big burst of I/O, since the deletes are logged like any other query.

[1]: https://docs.microsoft.com/en-us/sql/relational-databases/performance/best-practice-with-the-query-store?view=sql-server-2017
[2]: https://dba.stackexchange.com/q/218729/6141