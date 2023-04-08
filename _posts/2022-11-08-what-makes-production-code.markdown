---
layout: post
title:  "What Makes Production Code?"
categories: 
tags: 
---

This month's T-SQL Tuesday [invitation from Tom Zíka][2] caught my eye.  

[![The T-SQL Tuesday Logo][1]][1]

I really wanted to say "it's code that runs in production" but Tom beat me to the punch:

> You might think: “Production code is code that runs in production, duh.”
> 
> But let’s help out the newbies who look for a bit of concrete guidance.

Given I can't just be snarky, I want to talk about two important things that it's easy to forget about, and one caveat to the whole thing.

## Thing 1 - Performance

It's so easy for developers (like me!) to get a feature working with small datasets on our laptops, call it done, and not give it another thought...until we end up scrambling to address jobs running too long, slow page loads, or timeouts in production.

It's not always practical, or even possible, to simulate production load.  But we should do a better job of at least **thinking** about how a feature might scale.  With databases, usually this amounts to creating *at least* the bare minimum indexes to support queries being run by apps.

It feels like I've seen this pattern repeatedly where some rows in a table need to be purged after a certain date, and the query is scanning and sorting the whole table because there's no index to support the delete.

Scalability of queries also comes up a lot with ORM queries, especially when [premature materialization][3] strikes, or we've added [too many includes][4] and get 100,000 row resultset to display 64 rows (that's not an exaggeration - check out the post).

My advice is to give some thought to things like:

- How's that new feature going to work there's 10, 100, 1000 times more data than you have on your laptop?
- How well is the UI going to work if there are 500 rows in that grid instead of 5?  Or 5,000 characters in that field instead of 50?
- Is there anything that might break down if the app is running for an extended period of time, or even 24/7?

## Thing 2 - Production Support

It's really important to think about what is going to happen when your code is running in production, for real customers.

You don't want to get called by support at midnight because your app is down and they have no idea how to fix it.  So what can you do about this?  

I should note that my suggestions here are more app code level things, but the principal here applies to data platform code as well.

- Have your code write to a log file - anything that might be important to know when troubleshooting a problem, and especially the details of things that have gone wrong and how to fix them
  - for instance, you might write to a log file that some specific configuration values are missing, and indicate how and where to set them
  - you might have a try / catch block around access a third party tool or API - and in the catch you can indicate that the third party tool is down, so that support can focus their attention in the right place
- Provide documentation to your support team - the more they know, the more likely it is they'll be able to fix things for customers on their own quickly, without having to reach across to the dev team
- Provide good feedback to users when things go wrong - preventing calls to support is a great way to reduce support calling you 😀
- Where appropriate, enable the ability to change application behavior at runtime
  - This audience is likely very familiar with SQL Server trace flags.  Well you can do that with your own code too.
  - Maybe you need a way to increase logging - or turn it off completely in case it's causing a problem!
  - You might need to change a threshold for when old data should be deleted, or increase a timeout value for SQL queries or access to external code

This is not an exhaustive list, so communication is important.  Talk to other developers about their experience.  Talk to team leaders about what's important to them.  Talk to support about what their biggest complaints and problems are.

## The Caveat

All of the above is true, but it's true to varying degrees based on context.  A 24/7, multi-tenant, customer-facing app with huge traffic **might** need a little more TLC in these areas than some batch job that runs once a week to copy those HR spreadsheets from Jim's fileshare to Jane's fileshare.  Make sure you are using your time wisely.  As easy and common as it is for these items to be underdone or skipped entirely, it's possible to overdo it.

If I'm rushing to get an MVP done, and there's no sure thing that the product will even be sold, I don't want to sink 50% of my time and effort into great debugging tools and log messages.

## In Closing

I hope this helps others to stop and think about how scalable and supportable their code is.  As usual, the main reason I'm writing this, though, is so that I will remember it myself 😅  Happy coding!

[1]: {{ site.url }}/assets/2022-11-08-t-sql-tuesday-logo.jpg
[2]: https://straightforwardsql.com/posts/production-code/
[3]: https://joshthecoder.com/2019/04/23/orm-queries-premature-materialization-part-1.html
[4]: https://joshthecoder.com/2022/04/19/orm-queries-too-many-includes.html