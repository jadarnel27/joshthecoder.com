---
layout: post
title:  "SSDT problems: Deploying the Same Change Over and Over"
date:   2018-07-12 13:00:00 -0400
categories: 
---
Sometimes I tell SQL Server to do one thing, and instead it does whatever it feels like.

## You're not my real dad!

...and you can't tell me what to do!

Let's say I tell SQL Server to create this very unique and original table:

    CREATE TABLE [dbo].[Post]
    (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [PostType] VARCHAR(10) NOT NULL,
        
        CONSTRAINT [CK_Post_PostType] CHECK ([PostType] IN ('Question', 'Answer', 'Comment'))
    )

"Command Completed Successfully" is the little lie whispered in my ear.  Trust but verify, they say:

    select [definition] 
    from sys.check_constraints
    where [name] = 'CK_Post_PostType';

Which shows me a bunch of "or equals" statements instead of my beautiful "in" statement:

    ([PostType]='Comment' OR [PostType]='Answer' OR [PostType]='Question')

SQL Server has taken my constraint definition and converted it into whatever crazy (read: logically equivalent) thing it wants.  You can see the same thing when you script out the table in SSMS.

The same thing can happen with CAST.  Say I want to add a totally-not-contrived computed column to the table above:

    ALTER TABLE Post ADD PostTypeWithId AS CAST(Id AS VARCHAR) + PostType;

But look!

    select [definition] 
    from sys.computed_columns 
    where [name] = 'PostTypeWithId';

It gets stored using "CONVERT" instead of "CAST":

    (CONVERT([varchar],[Id])+[PostType])

I'm not sure if there is a name for this behavior, but I have [asked on dba.stackexchange.com][1].  Based on this stack trace I gathered from PerfView during the ALTER TABLE command, it looks like the change occurs as a part of algebrizing or optimizing the expression in the query:

![Screenshot of PerfView][4]

## SSDT is missing out

The way SQL Server Data Tools (SSDT) builds deployment scripts is by comparing the state of your code (compiled to a dacpac file) to what is currently deployed on the server.

Unfortunately, SSDT does not have a way to hook into the expression optimization process that SQL Server itself uses to determine the final, stored version of these object definitions.

The end result of *that* limitation is that your SSDT deployments will issue the same, pointless DDL statements each time they run.

Here's that `Post` table with the computed column in an SSDT project:

![Screenshot of the post table][2]

I've deploy this table to my local SQL Server instance successfully, so everything should be fully up-to-date.  But if I run the schema compare tool:

![Screenshot of schema compare][3]

It wants to change "CONVERT" back to "CAST" to match my source code.  If I then let it generate the deployment script, I get this:

    ALTER TABLE [dbo].[Post] DROP COLUMN [PostTypeWithId];
    
    
    GO
    ALTER TABLE [dbo].[Post]
        ADD [PostTypeWithId] AS CAST (Id AS VARCHAR) + PostType;

No matter how many times this runs, though, it will never actually update the column definition in SQL Server.  So it will keep happening on every deployment.

This can be problematic for deployments, especially due to the "drop and re-add" nature of this specific change.  This can also trigger SSDT "table rebuilds" (to be discussed in a future "SSDT problems" post) which can be absolutely HORRIBLE for performance and availability.

## What to do

The simplest solution is to change the source code to match what SQL Server ends up storing, so that the schema compare sees them as equal.  This may not match your desired coding style, but it fixes the endless deployment loop.  In my work, I try to catch these types of things during local or non-prod deployments, and make sure the source code gets updated before going to production.

Another option is to replace the expression with a call to a deterministic scalar valued function.  This might not be a great idea in terms of performance, but it also fixes the SSDT related deployment problem.

Thanks for reading!

[1]: https://dba.stackexchange.com/q/212047/6141
[2]: {{ site.url }}/assets/2018-07-12-post-table-definition.PNG
[3]: {{ site.url }}/assets/2018-07-12-schema-compare.PNG
[4]: {{ site.url }}/assets/2018-07-12-perfview.PNG