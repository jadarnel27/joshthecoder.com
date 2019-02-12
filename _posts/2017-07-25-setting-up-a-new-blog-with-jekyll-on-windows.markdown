---
layout: post
title:  "Setting Up a New Blog with Jekyll on Windows"
date:   2017-07-25 14:58:52 -0400
categories: 
---
As I ponder what to write on this blog, it occurs to me that the topic of 
how to set up a blog with Jekyll on Windows is fresh on my mind.  So, at the 
risk of being a bit "meta," here we go!

First of all, [what is Jekyll?][1]

> Jekyll is a simple, blog-aware, static site generator. It takes a template 
> directory containing raw text files in various formats, runs it through a 
> converter (like Markdown) and our Liquid renderer, and spits out a complete, 
> ready-to-publish static website suitable for serving with your favorite web 
> server.

There you have it. I think I first considered playing around with Jekyll while 
reading Nick Craver's blog about [optimizing his own blog.][2]  One thing I 
have really enjoyed about working with this technology is the simple 
deployment (more on that later).

## Installation
So to start, I need to [install Jekyll.][3]  You'll notice right away that one 
of the listed requirements is "*GNU/Linux, Unix, or macOS.*"  Fortunately, with 
the advent of Windows 10 Anniversary Update, I have access to the Windows 
Subsystem for Linux (aka Bash on Windows).  The Jekyll folks have provided an 
installation guide ([Installation via Bash on Windows 10][4]) that worked 
perfectly for me, so I will not re-hash it here.

Go ahead and install it.  I'll wait.

## Creating a new project
Now that I have Jekyll installed, I'll open a bash prompt and navigate to where 
I want to create my Jekyll project:

    jadarnel27@Compy386:/mnt/c/Users/jadarnel27$ cd /mnt/c/Code/Blogs
    jadarnel27@Compy386:/mnt/c/Code/Blogs$
	
Then I'll create the new project with the command `jekyll new josh-the-coder`.  
The "josh-the-coder" part just tells Jekyll to create the project in a new 
directory with that name, rather than the current directory.

*Note: you may need to run this command as root ("sudo jekyll new...").  I did 
the first time because my non-root account couldn't actually install the 
dependencies.*

	jadarnel27@Compy386:/mnt/c/Code/Blogs$ jekyll new josh-the-coder
	Running bundle install in /mnt/c/Code/Blogs/josh-the-coder...
	  Bundler: The dependency tzinfo-data (>= 0) will be unused by any of the platforms Bundler is installing for. Bundler is installing for ruby but the dependency is only for x86-mingw32, x86-mswin32, x64-mingw32, java. To add those platforms to the bundle, run `bundle lock --add-platform x86-mingw32 x86-mswin32 x64-mingw32 java`.
	  Bundler: Fetching gem metadata from https://rubygems.org/...........
	  Bundler: Fetching version metadata from https://rubygems.org/..
	  Bundler: Fetching dependency metadata from https://rubygems.org/.
	  Bundler: Resolving dependencies...
	  Bundler: Using public_suffix 2.0.5
	  Bundler: Using bundler 1.15.3
	  Bundler: Using colorator 1.1.0
	  Bundler: Using ffi 1.9.18
	  Bundler: Using forwardable-extended 2.6.0
	  Bundler: Using rb-fsevent 0.10.2
	  Bundler: Using kramdown 1.14.0
	  Bundler: Using liquid 4.0.0
	  Bundler: Using mercenary 0.3.6
	  Bundler: Using rouge 1.11.1
	  Bundler: Using safe_yaml 1.0.4
	  Bundler: Using addressable 2.5.1
	  Bundler: Using rb-inotify 0.9.10
	  Bundler: Using pathutil 0.14.0
	  Bundler: Using sass-listen 4.0.0
	  Bundler: Using listen 3.0.8
	  Bundler: Using sass 3.5.1
	  Bundler: Using jekyll-watch 1.5.0
	  Bundler: Using jekyll-sass-converter 1.5.0
	  Bundler: Using jekyll 3.5.1
	  Bundler: Using jekyll-feed 0.9.2
	  Bundler: Using minima 2.1.1
	  Bundler: Bundle complete! 4 Gemfile dependencies, 22 gems now installed.
	  Bundler: Use `bundle info [gemname]` to see where a bundled gem is installed.
	New jekyll site installed in /mnt/c/Code/Blogs/josh-the-coder.

To make sure that things are still going okay, I can have Jekyll host the 
new site locally and view it in the browser using the `jekyll serve` 
command.  I have to cd into the new directory first, though:

	jadarnel27@Compy386:/mnt/c/Code/Blogs$ cd josh-the-coder
	jadarnel27@Compy386:/mnt/c/Code/Blogs/josh-the-coder$ jekyll serve
	Configuration file: /mnt/c/Code/Blogs/josh-the-coder/_config.yml
				Source: /mnt/c/Code/Blogs/josh-the-coder
		   Destination: /mnt/c/Code/Blogs/josh-the-coder/_site
	 Incremental build: disabled. Enable with --incremental
		  Generating...
						done in 0.909 seconds.
						Auto-regeneration may not work on some Windows versions.
						Please see: https://github.com/Microsoft/BashOnWindows/issues/216
						If it does not work, please upgrade Bash on Windows or run Jekyll with --no-watch.
	 Auto-regeneration: enabled for '/mnt/c/Code/Blogs/josh-the-coder'
		Server address: http://127.0.0.1:4000/
	  Server running... press ctrl-c to stop.


![The default Jekyll site]({{ site.url }}/assets/2017-07-25-default-site.png)

## Basic customization	
You'll notice there is a lot of filler text here.  Most of this is set in the 
"_config.yml" file in the root of the project.  These settings are either 
self-explanatory, or well-commented.

I'll go in now and remove the GitHub and Twitter links, the email address, then 
update the site title and description.  The relevant portion of the file ends 
up like this:

	title: Josh the Coder
	description: > # this means to ignore newlines until "baseurl:"
	  This site is mostly about code, but also about other stuff!
	baseurl: "" # the subpath of your site, e.g. /blog
	url: "http://joshthecoder.com" # the base hostname & protocol for your site, e.g. http://example.com
	
To see these changes, I need to stop the `serve` action (ctrl-c) and run it 
again, because Jekyll doesn't reload this configuration file automatically.
This site is starting to look pretty good!

![A slightly customized Jekyll site]({{ site.url }}/assets/2017-07-25-customized-site.png)

## Dealing with posts
The last thing thing I need to figure out is how the "posts" actually work 
here.  Inside the "_posts" folder of the project directory, there is a file 
named "2017-07-25-welcome-to-jekyll.markdown" that serves as an example. 
Incidentally, this file contains a great explanation about how posts are 
managed:

> To add new posts, simply add a file in the `_posts` directory that follows the 
> convention `YYYY-MM-DD-name-of-post.ext` and includes the necessary front 
> matter. Take a look at the source for this post to get an idea about how it 
> works.
	
Seems pretty straightforward.  So I throw this masterpiece together:

	---
	layout: post
	title:  "Jekyll Vol. 2: The Jekylling"
	date:   2017-07-26 08:00:00 -0400
	categories: jekyll update
	---
	Can't stop.

	Won't stop.

	Probably should stop, though.

And it automatically shows up on my home page!  Well, it didn't the first time. 
Turns out Jekyll is smart enough to hide future-dated posts - in fact, it skips 
rendering them entirely!

![A second post on the home page]({{ site.url }}/assets/2017-07-25-new-post.png)

Well that's pretty much it for the basics.

## Deployment
One of the huge upsides for Jekyll is the simple deployment.  Whenever I build 
the project (with `jekyll build` or `jekyll serve`), a subfolder named "_site" 
is created inmy project directory.  That folder contains everything needed to 
run the site - all markdown is converted to HTML, all resources from the theme 
are copied to the appropriate places, etc.  So in the end, all I have to do is 
copy that folder to my web server.

## Next steps
I highly recommend perusing the rest of [the docs][5] to find out the many other 
customization and extension points.  I know my next stop was how to [override 
theme defaults.][6]

Have you used Jekyll?  Have another static site generator you like?  Think I'm 
doing all of this wrong?  Let me know in the comments!

[1]: https://jekyllrb.com/docs/home/#so-what-is-jekyll-exactly
[2]: https://nickcraver.com/blog/2015/03/24/optimization-considerations/
[3]: https://jekyllrb.com/docs/installation/
[4]: https://jekyllrb.com/docs/windows/#installation-via-bash-on-windows-10
[5]: https://jekyllrb.com/docs/home/
[6]: https://jekyllrb.com/docs/themes/#overriding-theme-defaults
