---
layout: post
title:  "A Year of Learning and Helping"
categories: 
tags: 
---

I enjoy posting answers on [Database Administrators Stack Exchange][1], which is a Q&A site that sits alongside Stack Overflow in the Stack Exchange family of sites.  I recently hit a milestone: I've posted 200 answers there over the last 14 months

That prompted me to reflect a little bit on my experiences during that time period, and thus this (soft, non-technical) blog post was born.

## 200 Answers

Here's the current status of my profile on DBA Stack Exchange:

[![screenshot of my dba.se profile][2]][2]

I'm a full stack developer in my day job at [J.S. Walker & Company, Inc][3] - a consulting firm near Charlotte, NC.  I mostly do custom application development using the Microsoft stack.  For most of my career I've used ORMs or other wrappers to interact with SQL Server.  I know a lot about ASP.NET, C#, and JavaScript - but SQL Server was never really my focus.

I originally started working to improve my database skills because of a client that adopted Availability Groups and In-Memory OLTP - I needed to be able to support their system!  And, as it turns out, supporting AGs requires [knowledge in a bunch of different areas][22].

I've found that nothing helps me learn better than helping other people.  So I started seeking out unanswered questions.  Most of the time I had no idea how to solve the problem. But I would read blog posts, read documentation, and try things out on my laptop until I figured it out.

I've learned a massive amount through the process of trying to help answer people's questions about SQL Server, from [what really happens when you clear the query store][4], to [what SQL Server is up to during a `NOLOCK` scan][5] and [how to really fill up an 8KB data page][6].  I get a lot out of figuring these things out personally, but it's always nice to hear that I [helped someone][13]:

[![screenshot of thank you comment][12]][12]

I've also met some really great people in the community on that site, who have encouraged me tremendously.  Which leads me to my next point...

## The People

There are folks I met on Stack Exchange that have taught me so much, and been so helpful to me personally (not to mention how much they help others), that I really couldn't begin to thank them enough: [Erik Darling][7], [Paul White][17], [Joe Obbish][18], [Forrest McDaniel][19], [Sean Gallardy][20], and [Max Vernon][21]

I'm sure there are more, but these few stand out as having had a huge impact on me, and I consider them friends.

## Starting a Blog

Erik is the first person that encouraged me to start blogging.  Maybe he just wants more people writing about SQL so he doesn't have to post 5 days a week 😜.  Regardless, I'm not sure I ever would have even considered it had he not pushed me a bit.  There are way smarter and more qualified folks out there blogging already.  I think this really captures where I stand right now on that subject though:

> You don't have to be an expert to teach.  It works the other way around: Leaders are seen as experts *because* they teach.
> 
> **Teach what you know *as* you go.**
> 
> You don't need to know more than everyone.  You need only know more than one other person.
> 
> **Teach people one step behind you.**  What do you wish you knew then?  
> Sean McCabe (@seanwes)

I'm no expert, but I do have something useful to share, and I genuinely hope it helps others.  Somewhat selfishly, I know that it helps me more than anyone else.  There's something about trying to explain technical things in writing that really ingrains it in my mind 😃.

This is the 24th post I've written in the last year or so.  That's not a ton, but it represents a lot of thought and work I've put in over the last year, and I'm really happy about it.

Some of my posts have been in [Brent Ozar's][23] weekly links newsletter, which is really cool too!  There is no way I would have gotten that kind of exposure on my own.

During this same timeframe, I've also dabbled in...

## Contributing to Open Source

I noticed an issue when running [`sp_Blitz`][9] on one of my machines with an AMD processor, so I decided to submit a PR.  So far I've submitted 7 different PRs to that repo that were merged.

While reading [The Docs][10], I noticed the occasional typo, formatting issue, or outdated bit of information.  I've had 10 PRs merged to the docs repo.

I also open-sourced a little command line tool I wrote to [get a list of SQL Server versions and their support dates][11], which is a nice thing to have when trying to programmatically tell if the server you're working on is on a supported version.

Working on open source has been really rewarding to me.  It's nice to know that things I've worked on in my free time are helping folks out every day.

## Opportunities and What's Next

I had some other cool opportunities over the last year.  

I was *gifted* a pass to attend Brent Ozar's "Mastering" classes on index, query, and server tuning.  I gained a ton of knowledge from those classes, and am really grateful for the chance to do 9 full days of training (not only grateful for the gift, but grateful to my employer - who  was very supportive in taking the hit while my billable rate dropped to zero for those days).

Follower's of this blog will know that I also [attended my first SQL Saturday][14] - another chance to learn a lot and meet great people.

What's next?  I'd love to try out speaking at [my local user group][16] one of these days, possibly on [the perils of ORM queries][15].  I've also considered trying to put up some video content on things that are just tough to cover in text - I'm so impressed by the work that folks like [Bert Wagner][16] put into that format.

## What's All This About

This is not some attempt to brag about myself - there are folks out there that do way more than I ever will.  My contributions are just a drop in the bucket.

Writing this has really helped me to reflect on what I've been passionate about over the last year or so.  It's been cool to try and quantify my efforts a little.  It's been EVEN MORE COOL to think about all the *people* that have helped me out along the way.  I hope I am managing to pay it forward, and I plan to continue to do so.

Thanks for reading - I'll try to get back to the technical stuff next time 😂

[1]: https://dba.stackexchange.com/
[2]: {{ site.url }}/assets/2019-06-26-two-hundred-answers.PNG
[3]: http://www.jswcoinc.com/Pages/default.aspx
[4]: https://dba.stackexchange.com/a/223093/6141
[5]: https://dba.stackexchange.com/a/207515/6141
[6]: https://dba.stackexchange.com/a/211771/6141
[7]: https://erikdarlingdata.com/
[9]: https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit
[10]: https://docs.microsoft.com/en-us/sql/?view=sql-server-2017
[11]: https://github.com/jadarnel27/SqlServerVersionScript
[12]: {{ site.url }}/assets/2019-06-26-thanks-1.PNG
[13]: https://dba.stackexchange.com/a/241424/6141
[14]: https://www.joshthecoder.com/2019/05/22/sql-saturday-atlanta-in-review.html
[15]: https://www.joshthecoder.com/2019/02/12/orm-queries-too-much-null-checking.html
[16]: http://charlotte-sql.org/
[17]: https://www.sql.kiwi/
[18]: https://erikdarlingdata.com/author/joe-obbish/
[19]: https://forrestmcdaniel.com/
[20]: http://www.seangallardy.com/
[21]: https://www.sqlserverscience.com/
[22]: https://www.joshthecoder.com/2018/12/03/always-run-rhs-in-separate-process.html
[23]: https://www.brentozar.com/