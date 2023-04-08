---
layout: post
title:  "Confusion When Not Specifying Nullability"
categories: 
tags: 
---

I always indicate whether a column allows `NULL` or not in `CREATE TABLE` and `ALTER TABLE` statements.

Or, you know, I'm in the habit of doing that.

Like, I try to be in the habit.

I'm doing my best, okay?

Anyway, it's good to be clear about nullability, because you can run into surprises when you aren't.  Clear.  This blog post is about one such situation.

## Reviewing Code

I was reviewing a PR recently, and noticed a `CREATE TABLE` statement that was structured like this:

    CREATE TABLE dbo.Something
    (
        Id bigint,
        OtherId bigint,
        
        CONSTRAINT PK_Something PRIMARY KEY (Id)
    );

My first thought was "that will fail with an error message!"  

A `PRIMARY KEY` column doesn't allow `NULL`s, and leaving off the `NULL` / `NOT NULL` specification (usually!) means the column is nullable.

However, I ran the create table statement, and it worked!  Not only that, but the `Id` column was made "not nullable" automatically.  I have included the `OtherId` column as a reference to show the behavior I expected when not being explicit about nullability:

    SELECT [name], is_nullable
    FROM sys.columns c 
    WHERE 
        c.[object_id] = OBJECT_ID('dbo.Something');

|name|is_nullable|
|----|-----------|
|Id|0|
|OtherId|1|

Out of curiosity, I tried dropping the `PRIMARY KEY` constraint, and the Id column remained "not nullable."  This makes sense, but I thought it was worth mentioning.

    ALTER TABLE dbo.Something
    DROP CONSTRAINT PK_Something;

|name|is_nullable|
|----|-----------|
|Id|0|
|OtherId|1|

You can see a live demo of all of this [on db<>fiddle][2].

By the way, this behavior is [mentioned in the documentation for `CREATE TABLE`][1], I had just never noticed it before:

> If nullability is not specified, all columns participating in a PRIMARY KEY constraint have their nullability set to NOT NULL.

## Where This Goes Wrong - SSDT Deployments

If I have that exact table definition as part of an SSDT project, things can get weird.

Let's say I need to remove the PK.  As demonstrated in the db<>fiddle link above, the `Id` column remains not nullable after dropping the constraint using T-SQL.

But if I remove the PK from the table definition in the SSDT project, and then create a deployment script, I get this:

    PRINT N'Starting rebuilding table [dbo].[Something]...';


    GO
    BEGIN TRANSACTION;

    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

    SET XACT_ABORT ON;

    CREATE TABLE [dbo].[tmp_ms_xx_Something] (
        [Id]      BIGINT NULL,
        [OtherId] BIGINT NULL
    );

    IF EXISTS (SELECT TOP 1 1 
            FROM   [dbo].[Something])
        BEGIN
            INSERT INTO [dbo].[tmp_ms_xx_Something] ([Id], [OtherId])
            SELECT [Id],
                [OtherId]
            FROM   [dbo].[Something];
        END

    DROP TABLE [dbo].[Something];

    EXECUTE sp_rename N'[dbo].[tmp_ms_xx_Something]', N'Something';

    COMMIT TRANSACTION;

    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

All of that `SERIALIZABLE` transaction and `INSERT`-`SELECT` nonsense is the table [being rebuilt][3].  Which is unpleasant enough, and it distracts from the fact that our `Id` column now allows `NULL` values.

SSDT sees that the `CREATE TABLE` statement (the "model" for our database), which has an implied `NULL` after the data type now that there is no PK, differs from the current state of the target (`NOT NULL`), and creates a script to migrate to that state.

None of this is what we want, and it's all a result of not being explicit about nullability.

## Where Else This Goes Wrong - Different Settings

It was pointed out to me that the default nullability of columns is configurable at the database level, and at the session level.

There's a [database-level setting documented][4] in the `ALTER DATABASE...SET` commands:

> ANSI_NULL_DEFAULT { ON | **OFF** }  
> Determines the default value, NULL or NOT NULL, of a column or CLR user-defined type for which the nullability isn't explicitly defined in CREATE TABLE or ALTER TABLE statements.

And the sort of redundant-sounding [session level option][5] `SET ANSI_NULL_DFLT_ON`:

> Modifies the behavior of the session to override default nullability of new columns when the ANSI null default option for the database is false.

Thus attempting to depend on the "default" might even be unreliable, depending on the database you're deploying to, or the connection level settings active at the time.

If you ever want to feel extra confused, read those docs pages about how the two features interact with each other 😵

## In Summary

Always specify the nullability of columns in `CREATE TABLE` and `ALTER TABLE` statements.  Failing to do so can cause SSDT deployments to unexpectedly make columns nullable, and can also result in unexpected results depending on database or session level settings.

[1]: https://docs.microsoft.com/en-us/sql/t-sql/statements/create-table-transact-sql?view=sql-server-ver15#primary-key-constraints
[2]: https://dbfiddle.uk/?rdbms=sqlserver_2019&fiddle=2ab11da3c49afa09e850ad4b3871dd6d
[3]: https://www.joshthecoder.com/2018/08/14/ssdt-problems-table-rebuilds.html
[4]: https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-database-transact-sql-set-options?view=sql-server-ver15
[5]: https://docs.microsoft.com/en-us/sql/t-sql/statements/set-ansi-null-dflt-on-transact-sql?view=sql-server-ver15