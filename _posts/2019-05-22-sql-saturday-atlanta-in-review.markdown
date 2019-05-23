---
layout: post
title:  "SQL Saturday Atlanta in Review"
categories: 
tags: 
---

<style type="text/css">
    img {
        width: 48%;
        margin: 0 auto;
        display: block;
    }

    p.inline img {
        display: inline;
    }
</style>

I attended my first SQL Saturday over the weekend: [SQL Saturday #845 - Atlanta 2019][1]

[![Photo of attendee badge and lanyard][28]][28]

There were *so many* great sessions on the schedule, I hated to have to narrow my choices to just one per time slot.  Unfortunately, I'm not familiar enough with *replication* to attend multiple sessions at once (feel free to groan audibly).

I wanted to take a minute and say a little bit about each of the sessions I *did* attend, and some of the people I met while I was there.  I'm going to go through the sessions in the order I attended them.

## SQL Server Internals and Architecture

I attended [this session][2] by Kevin Kline ([b][3]\|[t][4]) for the 8:00 am timeslot.  This was a fascinating overview of the different phases that SQL Server goes through when processing and executing a query - from parsing and binding, to compilation and plan caching, to runtime execution, and returning results.

Kevin seemed ridiculously comfortable presenting.  I feel like, even for experienced speakers, I can normally hear a little nervousness in their voice at the start of a talk.  Not so for Kevin.  He also really involved the attendees, asking questions and giving away a copy of one of his books!  I also got to chat with him for a few minutes before the session, and he is a super nice dude.

## Using the Power platform to radically change your business

Next up was [this session][5] from Patrick LeBlanc ([b][6]\|[t][7]) and Adam Saxton ([b][8]\|[t][9]).  I'll be honest, I've never used PowerBI.  My main reason for attending this session was because some friends said that Patrick and Adam are great presenters, and they absolutely did not disappoint.

These guys are incredibly entertaining, but even more than that, the talk really got me interested in trying out the product.  They are obviously passionate about the technology they work with, and telling stories about how they've helped businesses solve problems.  I have clients that have recently implemented BI solutions, and it would be cool to be able to leverage this tool to help them take even better advantage of the data now at their fingertips.

{:.inline}
[![Photo of Patrick and Adam presenting][10]][10]
[![Another photo of Patrick and Adam presenting][11]][11]

## 13 reasons why my query is slow

The [last session I attended][12] before lunch was by Fabiano Neves Amorim ([b][13]\|[t][14]).  I showed up just a couple of minutes before the talk was supposed to start, and the room was PACKED.  

We were in one of the medium-sized rooms, but clearly Fabiano's reputation preceded him.  All of the seats were full, every wall was lined with people standing, and I was among a group of folks sitting on the floor at the front of the room:

[![Photo of people sitting on the floor in Fabiano's talk][15]][15]

This presentation was great.  The creativity that Fabiano had to combine 13 different performance issues into one query is impressive.  And especially that all of the fixes were distinct from each other as well (that seems like it would be even trickier to put together).  Despite sitting on the floor, it was one of my favorites of the day!

## Containers - You Better Get on Board!

After lunch, I went to [this session][16] from Anthony Nocentino ([b][17]\|[t][18]).  I was really excited about this session - I keep hearing a lot about containers, but haven't really taken the time to dig in and learn what they're all about.  So, this was a great opportunity to hear about them from a recognized expert on the subject.

The demos were really well put together, and I'm looking forward to downloading the slides and scripts and trying it out myself.  But the best part of the session, for me, was the way Anthony explained how containers work, and the philosophical / point of view shift that they represent.  

Thinking of applications, even the SQL Server database engine, as "ephemeral" services that can be defined and orchestrated declaratively is such a neat concept.  I think the idea behind containers finally "clicked" for me while I was in this session.

## HA/DR Solutions Using Distributed Availability Groups (Read-Scalable AGs too!)

From there I headed up to the 3rd floor for the first time to attend [this session][19] from Jennifer Brocato ([speaker bio][20]).

Distributed Availability Groups are another SQL Server topic I've been interested in learning about, so I was really glad that Jennifer was there speaking on it.  I work with Availability Groups quite a bit in my day job (troubleshooting them [can be a pain][21]), but just haven't been able to wrap my head around this extension to the feature.

She did a great job covering the use cases for DAGs, and had thorough demos showing how to set them up.  Probably the best part of the presentation was a really cool T-SQL script for checking the health of your DAGs - overcoming current lack of UI around that in SSMS.

## Optimizing Data Access: Mixing Entity Framework Core and Dapper

Readers of this blog may realize that I have a keen interest in ORMs, so [this session][22] from Shawn Wildermuth ([b][23]\|[t][24]) was an automatic "attend" for me.

I love the idea of overcoming some of the challenges of EF by writing straight T-SQL with Dapper.  I also thought Shawn did a great job showing the pros and cons of *both* tools - rather than just bashing on ORMs, which are an easy target most of the time.

He also made the (somewhat controversial?) assertion that Dapper is not an ORM.  I don't entirely agree, although I get his point, and it certainly got my attention and made me think during his talk!

## Shout Out

I want to give a shout out to one more speaker: Angela Tidwell ([b][25]\|[t][26])

[![Photo of Tidwell's Tidbits sticker][27]][27]

Angela reached out to me on Twitter when I tweeted that this was my first ever SQL Saturday.  She showed genuine interest in making sure I had a good experience, despite me being a perfect stranger.  As a newcomer to the event, and SQL Saturday in general, this meant a lot and made me feel very welcome.

She is easy to spot in a crowd (very cool electric blue hair) - so I caught up with her and her husband between sessions and got to spend a few minutes between chatting with them in person.

Thanks for being kind - you're the *real* MVP.

## The End

Thanks for reading this non-technical post, I hope you got something out of it!  Click through the session links to find slides and scripts, and follow these folks on Twitter and their blogs for some really great content.

I look forward to attending more SQL Saturday's and other PASS events, maybe one day I'll even speak at one as well - and help others like all these kind folks have helped me

---

PS: sorry for the bad pictures, I'm no photographer 😶

[1]: https://www.sqlsaturday.com/845/EventHome.aspx

[2]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=91359
[3]: https://blogs.sentryone.com/author/kevinkline/
[4]: https://twitter.com/kekline

[5]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=91714
[6]: http://patrickdleblanc.com/
[7]: https://twitter.com/patrickdba
[8]: https://guyinacube.com/
[9]: https://twitter.com/GuyInACube
[10]: {{ site.url }}/assets/2019-05-22-patrick-and-adam-1.jpg
[11]: {{ site.url }}/assets/2019-05-22-patrick-and-adam-2.jpg

[12]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=87558
[13]: http://blogfabiano.com/
[14]: https://twitter.com/mcflyamorim
[15]: {{ site.url }}/assets/2019-05-22-fabiano.jpg

[16]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=87539
[17]: http://www.centinosystems.com/blog/
[18]: https://twitter.com/nocentino

[19]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=87833
[20]: https://www.sqlsaturday.com/845/Speakers/Details.aspx?name=jennifer-brocato&spid=6276

[21]: https://www.joshthecoder.com/2018/12/03/always-run-rhs-in-separate-process.html

[22]: https://www.sqlsaturday.com/845/Sessions/Details.aspx?sid=90149
[23]: https://wildermuth.com/
[24]: https://twitter.com/shawnwildermuth

[25]: https://www.tidwelltidbits.com/
[26]: https://twitter.com/angelatidwell
[27]: {{ site.url }}/assets/2019-05-22-tidwells-tidbits.jpg

[28]: {{ site.url }}/assets/2019-05-22-badge.jpg