---
layout: post
title:  "Optimizing away"
date:   2018-09-13 21:40:00 -0400
categories: 
---

## Dividing by zero

I was reading [a blog post from Erik Darling][1] which included this nifty bit of code:

    SELECT TOP 1000 u.Id, u.DisplayName, 2 AS sort_order
    FROM dbo.Users AS u
    WHERE EXISTS (SELECT 1/0 FROM dbo.Posts AS p WHERE u.Id = p.OwnerUserId AND p.Score > 0)
    AND u.Reputation > 1
    ORDER BY u.Reputation ASC, u.CreationDate DESC

Notice the `SELECT 1/0` in the `EXISTS` subquery.  Intuition would say that'll throw an error, but it doesn't.  But if you do the same thing in a normal select statement:

    SELECT 1/0 as [ThisWontWork];

> Msg 8134, Level 16, State 1, Line 1  
> Divide by zero error encountered.

Folks that have worked with SQL Server for a while aren't surprised by this.  That expression doesn't need to be executed in the subquery, because the query is just checking to see if there are *any* results.  So behind the scenes, the expression is replaced with some other placeholder value.

## Peeking at the optimizer

Paul White has a blog series called [Query Optimizer Deep Dive][2].  It's really fascinating reading, and one of the things Paul discusses is the use of trace flags to see some details of the query optimization process.

Without going too in-depth here (if you're interested, I highly recommend reading the whole series), I tried running Erik's query with a few of those trace flags switched on.  Here's a small snippet of the output from trace flag 8605:

    ScaOp_Exists 

        LogOp_Project

            ...skipping a bunch of stuff...

            AncOp_PrjList 

                AncOp_PrjEl COL: Expr1002 

                    ScaOp_Arithmetic x_aopDiv

                        ScaOp_Const TI(int,ML=4) XVAR(int,Not Owned,Value=1)

                        ScaOp_Const TI(int,ML=4) XVAR(int,Not Owned,Value=0)

The first line indicates we're processing the "exists" part of the query.  The `SELECT` results in a projection of one column, which it names `Expr1002`.  And the expression is further defined an division operation (`ScaOp_Arithmetic x_aopDiv`) on two constant integer values: 1 and 0.

Moving deeper, here's some of the output from trace flag 8606, after further processing has occurred:

    ScaOp_Exists 

        LogOp_Project

            ...skipping a bunch of stuff...

            AncOp_PrjList 

                AncOp_PrjEl COL: Expr1002 

                    ScaOp_Identifier COL: ConstExpr1004 

Now logical tree representation of the `EXISTS` portion of our query has been transformed!  We still have `Expr1002`, but rather than being a division operation, it's simply a reference to an identifier called `ConstExpr1004`.

However, that identifier isn't defined anywhere (in the trace flag output, or in the actual execution plan).

sqllang!CScalarGroupProperties::FHasSubQuery

x /n sqllang!CScalarGroupProperties*
x /n sqllang!**
sqllang!CAncOp_PrjList::FDeriveRuntimeConst

[1]: https://www.brentozar.com/archive/2018/07/cxconsumer-is-harmless-not-so-fast-tiger/
[2]: http://sqlblog.com/blogs/paul_white/archive/2012/04/28/query-optimizer-deep-dive-part-1.aspx