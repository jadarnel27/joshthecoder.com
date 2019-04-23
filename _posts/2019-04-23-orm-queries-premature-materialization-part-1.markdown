---
layout: series
title:  "ORM Queries: Premature Materialization (Part 1)"
categories: 
tags: [ORM Queries]
---

## The App Server Has Lots of RAM, Right?

When working with Entity Framework or NHibernate, it's not always obvious *when* a query is being executed - especially if you're new with these tools.  

This can be a problem when you send ("materialize") the query to SQL Server too early, before filtering conditions have been added.  

In this three part episode of the ORM Queries series, I'll show a couple of common scenarios where I've seen this happen.  But first, why do we care?

## On the Database Side of Things

On the SQL Server side, when an ORM sends a query prematurely, the result is usually:

- Way more rows being returned than necessary (think full table scans, or really large range scans)
  - And all of the usual problems with this: high disk I/O, buffer pool churn, large memory grants (if there are sorts involved), queries going parallel, etc
- Way more data being sent over the wire than necessary
  - Potentially leading to ASYNC_NETWORK_IO waits depending on how quick the app is at processing this data

## On the App Side of Things

For the .NET app, we run into:

- CPU and RAM cost of allocations on the heap for each object (row),
- CPU cost of garbage collection running on each object
  - execution of .NET code may pause completely for GC, depending on the type of GC
- Extra expensive "large object heap" (LOH) allocations (because of the big array that backs the resulting list of objects)
  - I say these are extra expensive because they require the above mentioned GC pause to clean up
- High potential for memory fragmentation over time
  - The LOH is not compacted by default like other portions of the heap, so repeated big allocations leave weird gaps that get harder to fill

## Sidebar: When Do Queries Execute Though?

In previous installments, I've used LINQ to write queries with Entity Framework.  This builds up an "expression tree" that represents the query.  But the query doesn't run into you do something to consume the results.  The Entity Framework docs discuss this on the page [How Queries Work][1]:

> The most common operations that result in the query being sent to the database are:
> 
> - Iterating the results in a for loop
> - Using an operator such as ToList, ToArray, Single, Count
> - Databinding the results of a query to a UI

In almost all of my examples, I use `.ToList()` to execute the LINQ query I've written immediately.  But it can be easy for this to seem like an arbitrary distinction, making it hard to know when queries are, or are not, sent to SQL Server.  For instance, this doesn't run any queries at all:

    var comments = db.StackOverflowComments
        .Where(c => c.Text.StartsWith("> being this new"))
        .Select(c => new { c.UserId, c.Score })
        .Take(100);

It just builds up an in-memory representation of the query, with a where clause, a specific select list, and a top clause.

But if I add `.Count()` to the end, the query runs right away (predictably returning the integer 100):

    var comments = db.StackOverflowComments
        .Where(c => c.Text.StartsWith("> being this new"))
        .Select(c => new { c.UserId, c.Score })
        .Take(100)
        .Count();

Same deal with the other methods mentioned in the docs quote above.

## Up Next

Now hopefully you can see why we don't want to prematurely materialize our ORM queries, and some of the ways that can happen.

Next up in the series are a couple of key examples where I see this happen quite a bit, and how to avoid them.

Until then, happy ORMing!

[1]: https://docs.microsoft.com/en-us/ef/core/querying/overview#when-queries-are-executed