---
layout: post
title:  "SQL Server Options in Azure"
categories: 
tags: 
---

<style type="text/css">
    p.center {
        text-align: center;
    }
</style>

I recently got the chance to attend a free talk by Bob Ward ([@bobwardms][1]) at the Microsoft campus here in Charlotte, NC.  One of the topics he covered was "What to choose when?" with regards to SQL Server in Azure.

I work for a consulting firm, and we're often tasked with helping our clients make the right choices about where and how to build their solutions.  So this is such an important question to answer!  And one that's been on our minds quite a bit as more and more customers express interest in cloud-based solutions to their problems.

## The Slides

Bob mentioned in his talk that this is not secret knowledge - Microsoft wants potential customers (and Microsoft Partners) to be informed on this topic.  In pursuit of that, he encouraged us to share far and wide to help as many folks as possible.

You can find all of Mr. Ward's presentations at this link: [https://aka.ms/bobwardms][2]

The specific presentation I attended is in a folder there called "Azure SQL Carolina 2020."  There are two decks in that folder:

- **SQL Server and Azure Data - What to Use When** (this one is the focus of this post)
- **SQL Server 2019: The Modern Data Platform** (great overview of what's in SQL Server 2019)

I encourage you to check out the slides, read the embedded notes, and share the links so we can all be better informed!

Here's my take on some of the key decision points.

## The Main Options Right Now

Things are always changing the cloud, but as it stands in early 2020, these are the main options for SQL Server in Azure:

- SQL Virtual Machines
- Managed Instances
- Databases (this one really has a number of sub-options, like serverless, hyperscale, and elastic pools)

I'm going to touch on each of these options, why you might choose them, and some of my personal takeaways from the talk as well.

### SQL Virtual Machines

If you've got an existing (legacy) SQL Server that needs to be put into the cloud, this is a potential "quick win" solution.  Some real life situations I've seen for this are:

- A business that wants to get away from dealing with their own bare metal datacenter management  
- Other applications (hosted in Azure) need to communicate with the legacy app / database, but can't (easily) do so with the other application on-prem
- The legacy SQL Server depends on other services on the same machine (SSRS, SSIS, niche drivers, etc)
- The legacy server is hosted in a third-party colo or hosting provider that is shutting down or raising prices

Compared to the other options, this one provides the least friction to getting your workload into Azure.  You still have access to the OS, can install other software, use *all* features of SQL Server, and configure the instance however you like.

{:.center}
[![SQL Virtual Machines][3]][3]

While you still have *some* of the management overhead of dealing with the OS-level maintenance, some of it can be automated through the platform (specifically Windows and SQL Server patches, as well as backups).

Additionally, the initial setup can be simplified by choosing the OS and SQL Server versions from a gallery of images.  Of course, if you need to set SQL Server up in a particular way, you can still install it yourself.

Finally, there's a lot of great information (especially around licensing) in the FAQ page: [Frequently asked questions for SQL Server running on Windows virtual machines in Azure][4]

### Managed Instances

This is one step removed from SQL Virtual Machines - you no longer have access to the OS host machine, and the features available within SQL Server are limited in various ways.  The list is pretty long, so I'll provide a couple of links here:

- [Azure SQL Database Features - SQL features][6]
- [Managed instance T-SQL differences, limitations, and known issues][5]

Personally, I think one of the biggest wins with Managed Instance is that high availability is configured and managed for you.  I've spent quite a bit of time learning and [troubleshooting][7] availability groups.  It's a great technology, but it's **not** simple.  None of the HA options is a walk in the park, so having this set up and managed for you is huge.

{:.center}
[![SQL Managed Instances][8]][8]

Along the same lines, having backups and point-in-time recovery automatically managed is a great feature.  So many (especially smaller) shops don't think carefully about RPO, so this is another load taken off your shoulders.

If you don't need OS-level access, but you do need instance-level features (agent jobs is a big one, but features like service broker or resource governor also apply here), this is probably the option for you.

### SQL Database

This option drops the server *and* instance-level stuff altogether - and leaves you with individual databases.

In my experience so far, SQL Database has been a popular option for *new* development.  I don't see folks interested in migrating legacy applications to this platform (although there are some good reasons to do so if you can make it work).

It's not uncommon to work with clients that don't have their own IT infrastructure, or dedicated DBA staff.  When delivering custom software for them, SQL Database is an *excellent* choice - no VMs to deal, no instance-level settings to be concerned about - just a single database for running their app.  You also get some of the big wins from managed instances here (no need to deal with backups and high availability).

{:.center}
[![SQL Database][9]][9]

In addition to the basic SQL Database product, there are variations on it right now that include:

- elastic pool (helps "optimize" pricing if you have a database-per-tenant multi-tenant app, and some tenants are much more demanding than others)
- serverless (if your database has "bursty" workloads followed by long periods of downtime)
- hyperscale (for massive databases - supports up to 100 TB of data files)

I'm not going in to a ton of detail on those options, as they are kind of niche and I haven't worked with them personally.  Check out the slides though, and keep the use-cases in mind as you prepare for new projects.

## Moving Forward

If you are beginning to consider a move to the cloud, or you're in a position where you're helping others make those choices, make sure to get informed of all the options available!  The story is going to be different for each database and application, but we need to know what we're getting into in order to make informed decisions.  

It might be easier than you expected (with the evolution of SQL VMs and MI), or there might be features available that open doors you didn't know existed (think hyperscale or serverless).  As I mentioned before, things are always changing in the cloud.  For instance, [Azure SQL Database Edge][10] and [Azure Arc][11] are new and evolving services (in preview at the time of this post).

Here are some ways to attempt to stay informed:

- Attend conferences when you can
  - Or just look at the topics being covered by viewing the conference schedule
- Follow SQL community members and Microsoft folks on social media
- Be on the look out for announcements from Microsoft through official blogs
  - [SQL Server Blog][12]
  - Microsoft Tech Community Articles
    - [Azure SQL Database][14]
    - [SQL Server][13]

Thanks for reading, and happy Azure-ing 😀

[1]: https://twitter.com/bobwardms
[2]: https://aka.ms/bobwardms
[3]: {{ site.url }}/assets/2020-03-20-azure-sql-options-vm.png
[4]: https://docs.microsoft.com/en-us/azure/virtual-machines/windows/sql/virtual-machines-windows-sql-server-iaas-faq
[5]: https://docs.microsoft.com/en-us/azure/sql-database/sql-database-managed-instance-transact-sql-information
[6]: https://docs.microsoft.com/en-us/azure/sql-database/sql-database-features#sql-features
[7]: https://www.joshthecoder.com/2018/12/03/always-run-rhs-in-separate-process.html
[8]: {{ site.url }}/assets/2020-03-20-azure-sql-options-mi.png
[9]: {{ site.url }}/assets/2020-03-20-azure-sql-options-db.png
[10]: https://azure.microsoft.com/en-us/services/sql-database-edge/
[11]: https://azure.microsoft.com/en-us/services/azure-arc/
[12]: https://cloudblogs.microsoft.com/sqlserver/
[13]: https://techcommunity.microsoft.com/t5/sql-server/bg-p/SQLServer
[14]: https://techcommunity.microsoft.com/t5/azure-sql-database/bg-p/Azure-SQL-Database