---
layout: post
title:  "SQL Agent, CmdExec, and Environment Variables"
categories: 
tags: 
---

Even though the exe runs as the proxy user, it inherits the environment variables loaded by its parent process (sqlagent.exe).  As it turns out, this is normal Windows behavior, since the exe is a child process of sqlagent.exe:

https://docs.microsoft.com/en-us/windows/win32/procthread/environment-variables

It is possible to load the proxy user's environment variables, they just aren't there by default.