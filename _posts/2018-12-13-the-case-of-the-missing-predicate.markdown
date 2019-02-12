---
layout: post
title:  "The Case of the Missing Predicate"
categories: 
---

## Some Innocuous Queries

Check out these _basic_ queries, run against the ubiquitous Stack Overflow.  Basic like pumpkin spice.  Or something with a high pH.  Or just, you know, straightforward.

    SELECT COUNT(*)
    FROM dbo.Comments AS c
    WHERE c.UserId IS NULL
    AND c.PostId = 38892391
    AND 1 = (SELECT 1)

    SELECT COUNT(*)
    FROM dbo.Comments AS c
    WHERE c.UserId IS NOT NULL
    AND c.PostId = 38892391
    AND 1 = (SELECT 1)

The very perceptive reader will note that the only difference between them is the predicate ("IS NULL" vs "IS NOT NULL") on the UserId field.  Field.  Column.  Whatever, you get it.

Things get a little more interesting when you look at the execution plans in SSMS.  They're both the same general plan shape:

![Screenshots of the two query plans][1]

But the predicates on these index seeks tell a different story:

![Zoomed-in screenshots of the index seeks][2]

Yes, this was puzzling enough to warrant a freehand interrobang.

Not that it's super-important, but the index you see there is this little guy:

    CREATE INDEX IX_PostId_UserId
    ON dbo.Comments (PostId, UserId);

## Zooming In

You can clearly see the `IS NULL` predicate is present in the seek predicates for the first query, but the `IS NOT NULL` predicate is completely omitted from the seek predicates of the second query.  This seems...weird.

At this point I yelled "enhance!" at the execution plan, but nothing happened.  So I decided to look at the XML.  

Check out this snippet from the second plan:

    <SeekKeys>
        <Prefix ScanType="EQ">
        <RangeColumns>
            <ColumnReference ... Table="[Comments]" Alias="[c]" Column="PostId" />
        </RangeColumns>
        <RangeExpressions>
            <ScalarOperator ScalarString="(38892391)">
            <Const ConstValue="(38892391)" />
            </ScalarOperator>
        </RangeExpressions>
        </Prefix>
        <IsNotNull>
        <ColumnReference ... Table="[Comments]" Alias="[c]" Column="UserId" />
        </IsNotNull>
    </SeekKeys>

So _there's_ that sneaky `IS NOT NULL` seek predicate on the UserId column.  It really is there, it's just not being displayed in the graphical execution plan.

In the `IS NULL` query (that displays correctly), the "UserId" seek predicate is included in the "RangeColumns" and RangeExpressions" nodes, and there is no "IsNotNull" node.  So it appears the display issue is limited to that "IsNotNull" node of the XML.

## Other Perspectives

I checked this out on [brentozar.com/pastetheplan/][2] (which uses the [html-query-plan][4] open source library), and Azure Data Studio, and they both have the same issue.

However, SentryOne Plan Explorer correctly identified and shows the `IS NOT NULL` seek predicate:

![Screenshot of Plan Explorer][5]

In defense of SSMS, it _does_ show the predicate if you look in the properties window.

## Fine I Won't Just Whine About It

In addition to this fascinating blog post, I've reported this on the SQL Server User Voice site here: [SSMS graphical execution plan doesn't show IsNotNull seek predicate][6]

But I thought I'd post this to make sure folks know they're not going crazy when they come across it.  For reference, this affects SSMS v17.9.1 (build 14.0.17289.0).  I didn't go back and check other versions of SSMS, so I'm not sure if this is a regression, or if it's always been the case.

By the way, thanks to [Erik Darling][7] for pointing this oddity out to me when he first came across it.  It was a neat problem to track down.

[1]: {{ site.url }}/assets/2018-12-13-similar-query-plans.PNG
[2]: {{ site.url }}/assets/2018-12-13-missing-predicate.PNG
[3]: https://www.brentozar.com/pastetheplan/
[4]: https://github.com/JustinPealing/html-query-plan
[5]: {{ site.url }}/assets/2018-12-13-plan-explorer.PNG
[6]: https://feedback.azure.com/forums/908035-sql-server/suggestions/36204361-ssms-graphical-execution-plan-doesn-t-show-isnotnu
[7]: https://www.brentozar.com/archive/author/erik-darling/