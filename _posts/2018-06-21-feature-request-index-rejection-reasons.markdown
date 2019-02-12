---
layout: post
title:  "Feature Request: Explain Why Indexes Were Skipped"
date:   2018-06-21 20:22:00 -0400
categories: 
---

## Inciting incident

I recently read about a really interesting feature of RavenDB on Oren's blog:

[RavenDB 4.1 Features - Explain that choice][1]

You should check out the post - and RavenDB, it's pretty nifty as well!

The gist of the feature is that, during the query optimization process, the database engine exposes information about each of the indexes it considered using - information including the reason why the index was rejected!

## Index choices in SQL Server

There are countless examples online of folks coming to a forum or Q&A site and asking "why isn't SQL Server using my beautifully crafted index?"  An extremely brief Google search for [sql server why index is not used][10] led me to these posts (among many others):

- [How Does SQL Server Choose Indexes to Use][2]
- [Why isn't SQL Server using my index?][3]
- [Why is query NOT using my index?][4]
- [Sql Server - Index not being used][5]
- [SQL Server why is index not used with OR][6]
- [SQL Server why index is not used][7]
- [SQL Server 2008R2 - Why is my index not used][8]
- [clustered index not being used][9]

As you can see from the answers to these questions, there are many factors at play when the optimizer chooses to use or not use an index (how narrow or wide is the index, is it covering, how many rows were estimated to be returned, etc).  

Understanding these various situations requires specialized knowledge and lots of experience with tuning queries and seeing how the optimizer reacts.

## The future

![THE FUTURE]({{ site.url }}/assets/2018-06-21-delorean.JPG)  
*From: [https://commons.wikimedia.org/wiki/File:Back_left.JPG][15]*

I think there's a clear desire in the SQL Server community to know *why* the optimizer chooses to use, or not use, indexes on a table.  However we can get that information, whether it's in actual execution plans, or a fully fleshed out Extended Event target.

To that end, I've created the following UserVoice request:

[Explain why indexes were skipped][16]

Here's a screenshot of a possible implementation:

![considered indexes in an execution plan]({{ site.url }}/assets/2018-06-21-considered-indexes.png)  

Please go vote and comment if you'd like to see this in the product!

## Miscellaneous

I went down a couple of dead ends while researching this post.  Here are some things that *don't* solve this problem.

# Extended events

I came across an extended event called `unmatched_filtered_indexes` with this description:

> Occurs when the optimizer cannot use a filtered index due to parameterization.

This is actually the exact kind of thing that RavenDB is providing - it's just an extremely narrow scenario.  It only applies to filtered indexes, and it only fires when the index was rejected [because of parameterization][14]:

> The query optimizer won’t consider filtered indexes if you’re using local variables or parameterized SQL for the predicate that matches the filter.

# Trace flag 302

I've seen several references to "Trace Flag 302" with [descriptions like this][13]:

> Prints information about whether the statistics page is used, the actual selectivity (if available), and what SQL Server estimated the physical and logical I/O would be for the indexes. Trace flag 302 should be used with trace flag 310 to show the actual join ordering.

Most of the references are to SQL Server 6.5 and 2000.  This TF doesn't appear to do anything when I run it on newer versions of SQL Server, but some of the posts online indicate that it used to dole out information about considered indexes.  I'd be really interested if anyone has experience with this TF from "back in the day" =)

Thanks for reading!

[1]: https://ayende.com/blog/183425-C/ravendb-4-1-features-explain-that-choice
[2]: https://dba.stackexchange.com/questions/210044/how-does-sql-server-choose-indexes-to-use
[3]: https://stackoverflow.com/questions/17858949/why-isnt-sql-server-using-my-index
[4]: https://stackoverflow.com/questions/46342449/why-is-query-not-using-my-index
[5]: https://stackoverflow.com/questions/44158539/sql-server-index-not-being-used
[6]: https://stackoverflow.com/questions/40874599/sql-server-why-is-index-not-used-with-or
[7]: https://stackoverflow.com/questions/8342402/sql-server-why-index-is-not-used
[8]: https://dba.stackexchange.com/questions/20100/sql-server-2008r2-why-is-my-index-not-used
[9]: https://social.msdn.microsoft.com/Forums/sqlserver/en-US/e796129b-a986-4b0c-8c7d-2bc6920e0cc4/clustered-index-not-being-used?forum=transactsql
[10]: https://www.google.com/search?q=sql+server+why+index+is+not+used
[13]: http://www.sqlservercentral.com/articles/Monitoring/traceflags/737/
[14]: https://www.brentozar.com/archive/2013/11/what-you-can-and-cant-do-with-filtered-indexes/
[15]: https://commons.wikimedia.org/wiki/File:Back_left.JPG
[16]: https://feedback.azure.com/forums/908035-sql-server/suggestions/34629823-explain-why-indexes-were-skipped