---
layout: post
title:  "Putting Files in a Database"
categories: 
tags: 
---

I think this is my first time participating in T-SQL Tuesday, but this month's [invitation from Deborah Melkin][2] was too tempting to pass up.

[![The T-SQL Tuesday Logo][1]][1]

## The Backstory

As Deborah's invite post suggests, this is a "that one time at that client" story.  I was working at a consulting firm, and we had written an app for a particular client.  Part of this application's workflow involved users uploading images alongside some other information.  These were not particularly large images in the grand scheme of things - they were taken by a microscope, and were a few kilobytes each, maybe.

However, this app had been in use for a long time.  And as you might have guessed from the title of this post, each of these images was stored in a single table in the database that backed this application

## The Problem(s)

By the time I came around, this one table was many times larger than every other table in the database combined.  This resulted in various problems.

### .NET Memory Fragmentation

There was a particular release of this software that started to experience `OutOfMemoryException`s in the app.  We were using NHibernate, and there was a bug that was causing the table with the image data to get loaded when searching for a related entity, even though we had configured NH not to do that.  

Every time a user executed a search, tens of thousands of these images got pulled from the database, polluted the buffer pool, got loaded into the app's memory, and then had to be garbage collected by the .NET runtime.  The end result was that the virtual memory space of the app got fragmented, leading to the out of memory errors.

### Deployments

We were working with SQL Server Data Tools (SSDT).  Whenever a new release of the software needed to be deployed, we had an automated process to take the latest backup from production and restore it to the UAT environment, so that the automated SSDT schema compare and deployment could be verified to work.  The restore took orders of magnitude longer because this huge table full of images, which delayed our release process.  This was particularly vexing in the case of high priority bug fixes.

To top it all off, the UAT and production databases were both in Availability Groups (AGs).  So the restore to UAT had to be done on both replicas - delaying things further.

### Storage

Piggybacking off the previous section, the full backups of this database were massive compared to what they really needed to be.  This meant increased storage needs every year as more images piled into this table.  It also meant that copying the backup files around (for UAT refreshes, for troubleshooting, for validation of the backups) was very slow.

### Performance

We had to take great care with any query that touched this table, to make sure we hit nonclustered indexes and avoided scanning the base table that had the images in it.  

And because this database was in an AG, writing or updating the images had to be replicated across the network.

## Solutions

We actually never resolved this situation while I was there - there was just never the motivation to fix this over building new features.  Classic story 😀  However, I did give a lot of thought to solutions.

The best solution, really, would be to store them on disk, and just store the paths to the files in the database.  I have heard arguments about worries about the files not being "transactionally consistent" with the data in the database.  My view is that access to the files should be limited to those that can be trusted with the access.  The truly paranoid could also store a hash of the file in the table alongside the path to make sure the file isn't changed outside the app.

As another option, we often considered the possibility of archiving or deleting old data as a solution.  The business was only required to keep the images for a few years, so there were quite a few images that could have been deleted outright.

## Non-Solutions

As a side note: the `FILESTREAM` feature in SQL Server is **not** a solution to this.  It doesn't address the performance issues.  And the inflated database and backup sizes are still fully in play.  It does help with the transactional consistency aspect and access control issues to some extent, but I don't really see it as much of an improvement over the files being in the table as `varbinary(max)` columns.

## In Closing

To be honest, I used to be *extremely* dogmatic about this position.  I've softened a little bit.  There are situations where images are known to be small, and there will be a limited number of them (due to some known business rule or constraint).  It's really very convenient to have these images in the DB, and I don't mind it.

However, any situation where files of unknown size are being uploaded by users, and there's potential for unconstrained growth, then I'm always going to push hard for keeping those files on disk, in blob storage - anywhere but the database.

[1]: {{ site.url }}/assets/2022-07-11-t-sql-tuesday-logo.jpg
[2]: https://debthedba.wordpress.com/2022/07/05/t-sql-tuesday-152-invitation/