---
layout: post
title:  "Sneaky async void Leads to ASP.NET Core Crash"
categories: 
tags: 
---

I had a production issue at work recently where an ASP.NET Core application would crash periodically.  It was a fairly tricky issue because it appeared to be crashing due to an unhandled exception in a Controller method - which shouldn't crash the app pool, it should be handled by ASP.NET Core and return an error to the browser.

## Setup

To start, I'll create a web API service with:

    dotnet new webapi --use-controllers -o CrashyApi

Now I'll create a class that has an `HttpClient` as a dependency:

    public class SpecialService
    {
        private readonly HttpClient _httpClient;

        public SpecialService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }
    }

Then I'll add the class to DI:

    builder.Services.AddTransient<SpecialService>();

Next, I'm going to configure an anonymous factory method that fills out the base address of the HttpClient from appsettings.json.  This is to keep things simple in the class - calls can use relative URIs, rather than needing to specify the full target domain:

    builder.Services.AddHttpClient<SpecialService>((provider, client) =>
    {
        using var scope = provider.CreateScope();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var baseUrl = config["SpecialBaseUrl"];

        if (string.IsNullOrWhiteSpace(baseUrl)) return;

        client.BaseAddress = new Uri(baseUrl);
    });

That factory method will get called any time the DI container is asked to resolve an instance of the `SpecialService` class.

Finally, I have a Controller endpoint that calls a method on my service, which just returns the configured base address (for simplicity's sake):

    [ApiController]
    [Route("[controller]")]
    public class TestController : ControllerBase
    {
        private readonly SpecialService _specialService;

        public TestController(SpecialService specialService)
        {
            _specialService = specialService;
        }

        [HttpGet(Name = "GetBaseAddress")]
        public string Get()
        {
            return _specialService.GetBaseAddress();
        }
    }

This works great, I can test it in the Swagger UI:

[![Screenshot of Swagger UI showing a 200 OK response with my website URL in the post body][1]][1]

## Feature Change

Now we have decided to get the base address from a DB instead of a configuration file.  That's an easy code change, in principle.  We have EF Core, so we can resolve the context instead of the `IConfiguration`, and then query the DB.

The updated factory code looks like this:

    builder.Services.AddHttpClient<SpecialService>(async (provider, client) =>
    {
        using var scope = provider.CreateScope();
        using var context = scope.ServiceProvider.GetRequiredService<DefaultEFContext>();
        var setting = await context.Settings.SingleAsync(s => s.SettingName == "SpecialBaseUrl");
        var baseUrl = setting.SettingValue;

        if (string.IsNullOrWhiteSpace(baseUrl)) return;

        client.BaseAddress = new Uri(baseUrl);
    });

I'll also make everything on the consuming side `async`, to more accurately match the real scenario:

    [HttpGet(Name = "GetBaseAddress")]
    public async Task<string> Get()
    {
        return await _specialService.GetBaseAddressAsync();
    }

This also works fine!  Swagger UI results look the same (I won't bother repeating the screenshot).

However, if the SQL Server is unavailable for any reason, that query in the factory method will throw an `Exception` (as one would expect).

Something that's not necessarily obvious from the code there is that the anonymous method is an `async void` method, which will crash the entire process (if you're running in IIS, that's the w3wp.exe process hosting the .NET application) in the face of an unhandled Exception.

This is pretty bad news, as often a SQL Server error can be transient - especially running in the cloud, where flaky networks and slow disks abound.

## About async void

Any unhandled `Exception` can crash a process.  However, when working with ASP.NET Core, it's easy to expect that normal user requests hitting controller endpoints are not vulnerable to this.  The framework will eventually handle the `Exception` and return a 500 error response.  

An `async void` method violates this expectation, because it runs on a separate thread, and thus `try-catch` blocks in the calling code can't catch `Exception`s thrown from the method (the calling method has already moved on).  This is explained in [the documentation][3], as well as why a `Task`-returning method does work normally with `Exception` handling:

> The caller of a void-returning `async` method can't catch exceptions thrown from the method. Such unhandled exceptions are likely to cause your application to fail. If a method that returns a `Task` or `Task<TResult>` throws an exception, the exception is stored in the returned task. The exception is rethrown when the task is awaited. Make sure that any `async` method that can produce an exception has a return type of `Task` or `Task<TResult>` and that calls to the method are awaited.

## Fixing

You can avoid this problem by:

- wrapping the contents of the anonymous method in a `try-catch` block
- using the synchronous APIs instead, and removing the `async-await` from the anonymous method

I went with the second approach, as there is really no need for that factory to be `async` - it was just made that way out of a habit of using the `async` EF Core APIs.  Here's the updated code:

    builder.Services.AddHttpClient<SpecialService>((provider, client) =>
    {
        using var scope = provider.CreateScope();
        using var context = scope.ServiceProvider.GetRequiredService<DefaultEFContext>();
        var setting = context.Settings.Single(s => s.SettingName == "SpecialBaseUrl");
        var baseUrl = setting.SettingValue;

        if (string.IsNullOrWhiteSpace(baseUrl)) return;

        client.BaseAddress = new Uri(baseUrl);
    });

Now, if even if there is an issue contacting the SQL Server, the browser will just get a 500 error, which the application can handle (by allowing a retry, showing an error message, etc.):

[![Screenshot of Swagger UI showing a 500 error response][2]][2]

## Summary

Avoid `async void` like the plague.  It's confusing and awful.  Be especially careful when using APIs that accept an `Action` as a parameter, as these are `void`-returning delegates, are easy to make `async`, and it's not nearly as obvious that you need to deal with the caveats of `async void` when this comes up.

[1]: {{ site.url }}/assets/2023-12-01-200-response-sync.png
[2]: {{ site.url }}/assets/2023-12-01-500-response-sync.png
[3]: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-return-types#void-return-type