---
layout: post
title:  "Accelerated Plan Forcing in SQL Server 2019"
categories: 
tags: 
---

> Disclaimer: this blog post is about preview software (SQL Server 2019 CTP 3.0).  Things can, and probably will, change by the time RTM hits.  Furthermore, this post is about a thus unannounced and undocumented feature of said software, so I'm totally making this crap up.  Enjoy!

I've seen several folks posting various "diffs" of different SQL Server DMVs, configuration tables, etc. to see what's new in SQL Server 2019.  One thing that jumped out at me as interesting was a new database-scoped configuration option with the name `ACCELERATED_PLAN_FORCING`.  So I decided to (attempt to) play around with that.

## Background: Everything is a Compile

