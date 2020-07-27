---
layout: post
title:  "TransactionScope Considered Annoying"
categories: 
tags: 
---

If I want to follow documented best practices, and keep my .NET transaction management simple, I'm going to use the `TransactionScope` class:

> The TransactionScope class provides a simple way to mark a block of code as participating in a transaction, without requiring you to interact with the transaction itself. A transaction scope can select and manage the ambient transaction automatically. Due to its ease of use and efficiency, it is recommended that you use the TransactionScope class when developing a transaction application.

Let's take a look at how that might work using the Stack Overflow sample database.

## Voting is the Best

Let's say we have a user, user #1358, who is logged in to our little system here.

This user comes across a post they like, so they vote it up.  There are two things that happen in our system when a post is upvoted:

1. the number of upvotes cast by user is increased by 1
2. the score of the post is increased by 10

With all that said, here's the code.  This is part of an ASP.NET Core RESTful API, using Entity Framework Core to access SQL Server 2019:

    [HttpPost("{id}/Upvote")]
    public async Task<IActionResult> Upvote(int id)
    {
        using (var transactionScope = new TransactionScope(
            TransactionScopeOption.Required, 
            TransactionScopeAsyncFlowOption.Enabled))
        {
            var loggedInUser = await _context.Users
                .Where(u => u.Id == 1358)
                .SingleAsync();

            loggedInUser.UpVotes += 1;
            await _context.SaveChangesAsync();

            var post = await _context.Posts
                .Where(p => p.Id == id).SingleAsync();

            post.Score += 10;
            await _context.SaveChangesAsync();

            transactionScope.Complete();
            return Ok(post.Score);
        }
    }

This works great, ship it!

## Following the Leaders

Of course, user #1358 writes some great posts themselves - so we have a page that will show a user's basic information and a list of all their posts.

When we view a user's profile, we also increment a field called "Views" that shows how many times their profile has been viewed.  We don't want to drive that number up if the same person is refreshing the profile page over and over again, so there's a "CheckForDuplicateView" method in there before we actually update the count.

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(int id)
    {
        using (var transactionScope = new TransactionScope(
            TransactionScopeOption.Required, 
            TransactionScopeAsyncFlowOption.Enabled))
        {
            var posts = await _context.Posts
                .Where(p => EF.Property<int>(p, "OwnerUserId") == id)
                .ToListAsync();

            if (!await CheckForDuplicateView())
            {
                var user = await _context.Users
                    .SingleAsync(u => u.Id == id);

                user.Views += 1;
                await _context.SaveChangesAsync();

                transactionScope.Complete();
                return Ok(new UserWithPostsModel(user, posts));
            }
            else
            {
                return Ok(new UserWithPostsModel(
                    posts.FirstOrDefault().OwnerUser, posts));
            }
        }
    }

You can assume that `CheckForDuplicateView` takes a few seconds because it's doing some pretty important and complex stuff.  And it's definitely not doing `await Task.Delay(3000);`.  Not that at all.

## Hello I Have a Problem

All of a sudden, I start hearing from users that they are getting errors like this when loading the list of posts for a user:

> Microsoft.Data.SqlClient.SqlException (0x80131904): Transaction (Process ID 54) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.

At this point, I'll grab the deadlock graph to see what's going on.

## Killing Me Softly with Deadlocks

Here's a screenshot of that deadlock graph in Sentry One Plan Explorer:

![[Screenshot of deadlock graph in Sentry One Plan Explorer][1]][1]

And a breakdown of the order of operations, which is represented by the numbers in between parentheses:

1. Session 54 (which is loading the list of posts for user 1358) takes out a number of shared (`S` and `RangeS-S`) key locks on the posts table - one for each of that user's posts
2. Session 56 takes an `X` key lock on the users table (in order to update user 1358's reputation)
3. Session 54 wants an `X` lock on the same key in the user's table (in order to update user 1358's profile view count), but it's blocked by the incompatible X lock already held by session 56
4. Session 56 wants an `X` lock on of the keys that were locked by session 54 in step 1 (in order to update the post's score), but it's blocked because those shared locks are still being held onto

And now we're stuck.

I'm really fond of [`sp_BlitzLock`][2] for quickly reviewing deadlocks, and this puts the red flag in this situation front and center:

![[Screenshot of blitzlock results showing serializable isolation on both sessions][3]][3]

I can see pretty quickly that these queries are using the most restrictive isolation level: `SERIALIZABLE`

But that's weird, right?  I didn't change the isolation level, and the default for SQL Server is `READ COMMITTED`.

## Unexpected Default

Despite the fact that the SQL Server default isolation level is `READ COMMITTED`, the default isolation level when using `TransactionScope` is `SERIALIZABLE`.

This problem has been around a long time.  David Browne (Microsoft) wrote about it in *checks watch* **2010**!

[using new TransactionScope() Considered Harmful][4]

But surely this wouldn't be the problem still, right?  I'm using all the new hotness - ASP.NET Core 3.1, EF Core, etc.  Good news, we can check since [this stuff is open source now][5]!

    internal static IsolationLevel DefaultIsolationLevel
    {
        get
        {
            TransactionsEtwProvider etwLog = TransactionsEtwProvider.Log;
            if (etwLog.IsEnabled())
            {
                etwLog.MethodEnter(TraceSourceType.TraceSourceBase, "TransactionManager.get_DefaultIsolationLevel");
                etwLog.MethodExit(TraceSourceType.TraceSourceBase, "TransactionManager.get_DefaultIsolationLevel");
            }

            return IsolationLevel.Serializable;
        }
    }

*Noooooooooooo!!!*

## Fixing It

Since this odd default is still around, even after a rewrite of the .NET Framework that wasn't shy about breaking backwards compatibility from time to time, we need to deal with it.  Fortunately, David Browne's solution still applies.  I just need to add a little code when setting up my `TransactionScope` objects (or use a helper method, as in David's blog post):

    var options = new TransactionOptions
    {
        IsolationLevel = IsolationLevel.ReadCommitted,
        Timeout = TransactionManager.DefaultTimeout
    };

    using (var transactionScope = new TransactionScope(
        TransactionScopeOption.Required, 
        options,
        TransactionScopeAsyncFlowOption.Enabled))
    {

With `READ COMMITTED`, the shared locks on the posts table taken in step #1 above are released very quickly (rather than being held for the duration of the transaction), which lets the rest of the process proceed without blocking or deadlocks.

## Not Forgetting

Why am I writing about this, since it seems to have been [covered online ad-nauseum][6]?  

Well for one thing, I haven't seen a lot of practical *demos* about this stuff.  Hopefully the code samples above help folks wrap their heads around this problem.

But mostly it's because I forget this all the time when working on new apps, and I'm hoping this will help me remember 🤣

[1]: {{ site.url }}/assets/2020-07-27-deadlock-graph.png
[2]: https://www.brentozar.com/archive/2017/12/introducing-sp_blitzlock-troubleshooting-sql-server-deadlocks/
[3]: {{ site.url }}/assets/2020-07-27-blitzlock-results.png
[4]: https://docs.microsoft.com/en-us/archive/blogs/dbrowne/using-new-transactionscope-considered-harmful
[5]: https://github.com/dotnet/runtime/blob/4a683afec06f01e21651e7da1e6996277665e0ce/src/libraries/System.Transactions.Local/src/System/Transactions/TransactionManager.cs#L274-L287
[6]: https://www.google.com/search?q=transactionscope+serializable