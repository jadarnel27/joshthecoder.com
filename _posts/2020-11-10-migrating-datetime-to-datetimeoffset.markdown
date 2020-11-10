---
layout: post
title:  "Migrating datetime to datetimeoffset"
categories: 
tags: 
---

I was working with a colleague to change some `datetime` columns to `datetimeoffset` recently, and the details turned out to be trickier than I expected.

## Background

We have an application that uses `datetime` columns in a number of places.  All of the users have always been in Eastern Time, but now we have a request to introduce users from a different time zone (Central Time) into the system.  The lack of time zone information in our dates and times now presents a problem.  

The system needs to communicate to users how long ago something occurred, or a time in the future that something needs to be done.  If an Eastern Time user enters in a "follow up time" of today at 2:00 pm, a Central Time user could log in, see that, and end up being an hour late following up with their customer.

## Starting with datetime

Imagine this is a bug tracker application.  We have a table that looks like this:

    CREATE TABLE dbo.BugReport
    (
        Id int IDENTITY(1,1) NOT NULL,
        Report nvarchar(500) NOT NULL,
        SubmittedDate datetime NOT NULL,
        FollowUpDate datetime NULL
    );

And data that looks like this:


    INSERT INTO dbo.BugReport
        (Report, SubmittedDate, FollowUpDate)
    VALUES
        ('Shit''s busted', '2020-11-06 08:30:00', NULL),
        ('Shit''s STILL busted', '2021-06-06 08:30:00', NULL);
    GO

    SELECT
        br.Id, 
        br.Report, 
        br.SubmittedDate, 
        br.FollowUpDate
    FROM dbo.BugReport br;

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 08:30:00.000][1]][1]

The nice thing is that we could assume all of our data in the system is in Eastern Time.

## Step 1 - Convert to datetimeoffset

We're using SSDT publish to deploy the database, so we change the data type from `datetime` to `datetimeoffset`, and publish.  Which results in:

    ALTER TABLE dbo.BugReport
    ALTER COLUMN SubmittedDate datetimeoffset(0) NOT NULL;

*Note: we used "0" as the precision because we've never made use of the fractional seconds in our application, so truncating them was acceptable*

Running the same `SELECT` as before shows us:

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 08:30:00 +00:00][2]][2]

## Step 2 - Add the Offset

Now we have an offset, but it's UTC.  We want Eastern Standard Time, which is -05:00.

### Attempt 1 - SWITCHOFFSET()

At first glance, using `SWITCHOFFSET` seems appealing:

    UPDATE dbo.BugReport
    SET SubmittedDate = SWITCHOFFSET(SubmittedDate, '-05:00');

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 03:30:00 -05:00][3]][3]

Now we have the offset, but we have a problem - the time is wrong.  We're showing a local time of 3:30 am EST, so `SWITCHOFFSET` is shifting the time into the target offset (not just replacing the offset).

### Attempt 2 - TODATETIMEOFFSET()

There's another system function available for modifying time zone offsets, let's give that a try:

    UPDATE dbo.BugReport
    SET SubmittedDate = TODATETIMEOFFSET(SubmittedDate, '-05:00');

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 08:30:00 -05:00][4]][4]

Great!  Now we have the correct local time *and* offset.

However, the **big** problem we have here is that Eastern Time isn't always -05:00.  During daylight savings time, the offset changes to -04:00.

We have lots of historical data that crosses the DST boundary each year, and in fact crosses into the pre-2007 period before the current daylight savings rules came into effect.

Dealing with this ourselves seems fraught with potential mistakes.  Fortunately, SQL Server 2016+ has an answer for us.

### Attempt 3 - AT TIME ZONE

The `AT TIME ZONE` clause will convert one time zone into another, taking into account daylight savings time.

Let's give that a shot:

    UPDATE dbo.BugReport
    SET SubmittedDate = SubmittedDate AT TIME ZONE 'Eastern Standard Time';

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 03:30:00 -05:00][5]][5]

Well that's a huge bummer.  We're back to the behavior of `SWITCHOFFSET()`, which sets the local time to the wrong value.

Worry not, though - the answer to our problem, as usual, [lies in the documentation][6]:

> When *inputdate* is provided without offset information, the function applies the offset of the time zone assuming that *inputdate* is in the target time zone. If *inputdate* is provided as a *datetimeoffset* value, then **AT TIME ZONE** clause converts it into the target time zone using the time zone conversion rules.

Because we have already converted this column to `datetimeoffset`, SQL Server sees that +00:00 (UTC) offset, and assumes we want to shift from UTC to the target time zone.

We want the behavior from the first sentence there ("*assuming that inputdate is in the target time zone*"), and an easy way to get our inputdate "without offset information" is to `CONVERT` it back to a `datetime`:

    UPDATE dbo.BugReport
    SET SubmittedDate = CONVERT(datetime, SubmittedDate) AT TIME ZONE 'Eastern Standard Time';

[![Screenshot of results in SSMS showing date formatted as 2020-11-06 08:30:00 -05:00 and 2021-06-06 08:30:00 -04:00][7]][7]

There we go!  I included both rows in this last screenshot, to show that `AT TIME ZONE` is smart enough to use the right offsets based on the time of year (DST or not).

## Conclusion

Given the constraints (all data is in the same time zone right now), I was hoping this would be pretty straightforward.  

As you can see, there's a little bit of nuance to using these `datetimeoffset`-related functions - and there's the universally-loved concept of daylight savings time to work around as well.

Special thanks to Data Platform MVP Kamal Valero ([Twitter][8]) and former SQL Server user (and current disgraced Postgres user) Peter Vandivier ([Twitter][9]) for brainstorming with me when we started spinning our wheels on this thing.

[1]: {{ site.url }}/assets/2020-11-10-datetime.png
[2]: {{ site.url }}/assets/2020-11-10-datetimeoffset-utc.png
[3]: {{ site.url }}/assets/2020-11-10-datetimeoffset-switchoffset.png
[4]: {{ site.url }}/assets/2020-11-10-datetimeoffset-todatetimeoffset.png
[5]: {{ site.url }}/assets/2020-11-10-datetimeoffset-attimezone-wrong.png
[6]: https://docs.microsoft.com/en-us/sql/t-sql/queries/at-time-zone-transact-sql?view=sql-server-ver15
[7]: {{ site.url }}/assets/2020-11-10-datetimeoffset-attimezone-right.png
[8]: https://twitter.com/kamalvalero
[9]: https://twitter.com/PeterVandivier