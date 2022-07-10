---
layout: series
title:  "ORM Queries: Too Many Includes"
categories: 
tags: [ORM Queries]
---

I recently read a great blog post about the problem of cartesian explosion:

[How to Avoid Cartesian Explosion while using EF Core][1] by Daniel Rusnok

I'd highly encourage you to read that, and take their advice!

Daniel shows an example of an EF query that only needs to query 106 rows, but ends up with a resultset of 500 rows.

## Is It That Bad, Though?

I can imagine someone reading that and not seeing the gravity of the situation.  "Hey, 500 rows isn't that many - we have modern hardware!"

I thought it was worth writing about a real world situation where this can get _seriously_ out of hand.

## The Setup

_Note: the details and industry the code is related to have been changed, so don't worry too much if this isn't exactly how you would model things_

Imagine we have a system that models retail stores.  The Entity Framework object ends up looking like this:

```
public class Store
{
    public long Id { get; set; }
    public string Name { get; set; }

    public List<Employee> Employees { get; set; }
    public List<Product> Products { get; set; }
    public List<StoreHour> Hours { get; set; }
    public List<StoreClosures> Closures { get; set; }
    public List<Vendor> Vendors { get; set; }
}
```

To describe this with the SQL Server tables:

- dbo.Store - represents a physical retail location
- dbo.Employees - Employees can be scheduled at multiple stores (has a many-to-many relationship with stores via dbo.StoreEmployees)
- dbo.Products - Products can stocked in multiple stores (has a many-to-many relationship with stores via dbo.StoreProducts)
- dbo.StoreHour - These represent the regular store hours on each day of the week for each store (has a one-to-many relationship with stores)
- dbo.StoreClosures - These represent exceptions to the regular store hours, for example for holidays (has a one-to-many relationship with stores)
- dbo.Vendors - These represent vendors that each store engages with, for example local maintenance companies (has a one-to-many relationship with stores)

[![Screenshot showing the tables above in the SSMS Object Explorer][6]][6]

Okay, hopefully that all makes some sense.

## The Use Case

We're building a user interface where you can see ALL the details about a particular store, and maybe even edit them (add and remove products, employees, change store hours).

We need basically everything from these tables, but we only need them for one store, so the query would look like this in C#:

```
var store = context.Stores
    .Include(s => s.Employees)
    .Include(s => s.Products)
    .Include(s => s.Hours)
    .Include(s => s.Closures)
    .Include(s => s.Vendors)
    .Single(s => s.Id == 1);
```

A representative store looks something like this:

- 1 Store (Id #1)
- 24 Employees
- 21 Products
- 4 Vendors
- 7 Store Hours
- 7 Store Closures

If you read Daniel's post earlier, you're probably starting to get worried.  If we were writing a stored procedures to load this data, it would need to return **64 rows** total.  Maybe 6 procs, or 1 proc that returns multiple resultsets, or something similar.  Pretty manageable.

## The Query

The EF-generated query looks like this:

```
SELECT [t].[Id], [t].[Name], [t0].[EmployeeId], [t0].[StoreId], [t0].[Id], [t0].[Filler], [t1].[ProductId], [t1].[StoreId], [t1].[Id], [t1].[Filler], [s2].[StoreId], [s2].[Id], [s2].[Filler], [s3].[StoreId], [s3].[Id], [s3].[Filler], [v].[StoreId], [v].[Id], [v].[Filler]
FROM (
    SELECT TOP(2) [s].[Id], [s].[Name]
    FROM [Stores] AS [s]
    WHERE [s].[Id] = @__p_0
) AS [t]
LEFT JOIN (
    SELECT [s0].[EmployeeId], [s0].[StoreId], [e].[Id], [e].[Filler]
    FROM [StoreEmployees] AS [s0]
    INNER JOIN [Employees] AS [e] ON [s0].[EmployeeId] = [e].[Id]
) AS [t0] ON [t].[Id] = [t0].[StoreId]
LEFT JOIN (
    SELECT [s1].[ProductId], [s1].[StoreId], [p].[Id], [p].[Filler]
    FROM [StoreProducts] AS [s1]
    INNER JOIN [Products] AS [p] ON [s1].[ProductId] = [p].[Id]
) AS [t1] ON [t].[Id] = [t1].[StoreId]
LEFT JOIN [StoreHour] AS [s2] ON [t].[Id] = [s2].[StoreId]
LEFT JOIN [StoreClosures] AS [s3] ON [t].[Id] = [s3].[StoreId]
LEFT JOIN [Vendor] AS [v] ON [t].[Id] = [v].[StoreId]
ORDER BY [t].[Id], [t0].[EmployeeId], [t0].[StoreId], [t0].[Id], [t1].[ProductId], [t1].[StoreId], [t1].[Id], [s2].[StoreId], [s2].[Id], [s3].[StoreId], [s3].[Id], [v].[StoreId]
```

_Note: I added an nvarchar(100) "Filler" column to all the tables, to represent ~100 bytes of additional columns_

This query returns **98,784 rows**.  Absolutely bonkers.

[![Screenshot of SSMS showing the completed query and highlighting the number of rows being 98,784][3]][3]

## The Consequences

This query worked in development because there wasn't a representative amount of data.

This query worked in QA with representative data, albeit a little slowly, because all of QA's hardware is fast and physically close together.

This query **failed in production**, basically immediately, for two reasons:

- there was even more data
- production is in the cloud, where the app servers and SQL Server are on different cloud VMs

Slow storage, and the latency associated with sending 100,000 rows over the network between these two servers, resulted in slow page loads and frequent query timeouts.  As a bonus to all the other problems, the query went parallel and needed a large memory grant to do the sorting.

## The Fix

The fix, of course, is exactly as described in the other blog post - use `AsSplitQuery()` in the LINQ query in C#.  The end result of that changes is that 6 queries are run, returning a total of **64 rows** - as we originally expected.

By the way, EF Core generates a nifty warning about cartesian explosion:

> warn: 4/19/2022 21:51:34.844 RelationalEventId.MultipleCollectionIncludeWarning[20504] (Microsoft.EntityFrameworkCore.Query)
>       Compiling a query which loads related collections for more than one collection navigation, either via 'Include' or through projection, but no 'QuerySplittingBehavior' has been configured. By default, Entity Framework will use 'QuerySplittingBehavior.SingleQuery', which can potentially result in slow query performance. See https://go.microsoft.com/fwlink/?linkid=2134277 for more information. To identify the query that's triggering this warning call 'ConfigureWarnings(w => w.Throw(RelationalEventId.MultipleCollectionIncludeWarning))'.

It's too bad very few people concern themselves with warnings 😅

## Side Note About Owned Entities

If any of the collections are configured as owned entities, then they will be included via `JOIN`s whether you specify you want a split query or not.  This "auto include" behavior can be changed by specifying `AutoInclude(false)` on the owned collection:

```
builder.Entity<Store>()
    .OwnsMany(
        s => s.Hours,
        h =>
        {
            h.Property(x => x.Filler).HasMaxLength(100);
        })
    .Navigation(s => s.Hours)
    .AutoInclude(false);
```

Thanks to user [Ivan Stoev][5] for being the hero we need on this Stack Overflow Q&A: [EFCore - How to exclude owned objects from automatic loading?][4]

## Conclusion

My rule of thumb is exactly in line with the warning I quoted above - if you have more than one `Include(...)` for *collection* properties, use the split query option.  If you only have one, it's okay to leave things as-is. But honestly, I wouldn't be against the option outlined in the docs here for most apps:

[Split queries][2]

> You can also configure split queries as the default for your application's context:
> 
>     protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
>     {
>         optionsBuilder
>             .UseSqlServer(
>                 @"Server=(localdb)\mssqllocaldb;Database=EFQuerying;Trusted_Connection=True",
>                 o => o.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery));
>     }

Happy coding!

[1]: https://trycatchblog.tech/how-to-avoid-cartesian-explosion-while-using-ef-core
[2]: https://docs.microsoft.com/en-us/ef/core/querying/single-split-queries
[3]: {{ site.url }}/assets/2022-04-19-ninety-eight-thousand.png
[4]: https://stackoverflow.com/a/54044178/861565
[5]: https://stackoverflow.com/users/5202563/ivan-stoev
[6]: {{ site.url }}/assets/2022-04-19-table-listing.png