---
layout: post
title:  "AG Routing Problems"
categories: 
tags: 
---

I was setting up a home lab environment for Availability Groups recently, and ran into this error while creating the listener:

> The Windows Server Failover Clustering (WSFC) resource control API returned error code 5054.

I had trouble finding info on a solution using my trusty Googling skills, so I reached out to [my buddy Sean][4] to see if he could set me straight.

## Setting Things Up

For setting up the environment, I was following this really in-depth guide from former Data Platform MVP and current Microsoft employee Ryan J. Adams: [Build a SQL Cluster Lab Part 1][1]

The guide is generally fantastic, and provides a lot of good insight into the non-SQL Server related aspects of setting up an Availability Group.  I'd highly recommend checking it out if you're interested in that sort of thing.

Relevant to this post, he has provided a diagram of how the different networks are configured:

[![diagram showing the overall architecture of the lab][2]][2]

If you're very experienced with networking, you may already have some idea of what the problem is going to be.  Don't spoil it for everyone else okay?

## Hitting the Error

I got as far as trying to create the AG listener:

    /* Here we create a listener for our AG. If you have issues creating the listener check permissions in AD.
        You might also have to turn the AG networks to client and cluster and then turn them back to none post-listener creation*/
    ALTER AVAILABILITY GROUP [App1AG]
    ADD LISTENER N'App1AG' (
    WITH IP
    ((N'10.0.0.11', N'255.255.255.0'),('172.16.0.11','255.240.0.0'))
    , PORT=1433);
    GO

Running that resulted in a series of errors, including the one I mentioned at the beginning.  Here is the whole pile of errors:

> Msg 41009, Level 16, State 7, Line 160  
> The Windows Server Failover Clustering (WSFC) resource control API returned error code 5054.  If this is a WSFC availability group, the WSFC service may not be running or may not be accessible in its current state, or the specified arguments are invalid.  Otherwise, contact your primary support provider.  For information about this error code, see "System Error Codes" in the Windows Development documentation.
> Msg 19476, Level 16, State 3, Line 160  
> The attempt to create the network name and IP address for the listener failed. If this is a WSFC availability group, the WSFC service may not be running or may be inaccessible in its current state, or the values provided for the network name and IP address may be incorrect. Check the state of the WSFC cluster and validate the network name and IP address with the network administrator. Otherwise, contact your primary support provider.
> Msg 19476, Level 16, State 1, Line 160  
> The attempt to create the network name and IP address for the listener failed. If this is a WSFC availability group, the WSFC service may not be running or may be inaccessible in its current state, or the values provided for the network name and IP address may be incorrect. Check the state of the WSFC cluster and validate the network name and IP address with the network administrator. Otherwise, contact your primary support provider.

I looked up error 5054 [in the Windows docs][3], and all it says is:

> **ERROR_CLUSTER_INVALID_NETWORK**
> 
> 5054 (0x13BE)
> 
> The cluster network is not valid.

I get the general vibe that something isn't valid.  Not sure what it is though.  Let's take a closer look.

## The Cluster Networks

Alright, my cluster networks look like this:

[![Screenshot of cluster networks in failover cluster manager][5]][5]

The purpose of all these networks is to keep different types of network traffic separated from each other:

- AG: Set to "None."  This is set to none because we only want log blocks being sent over this network (that is, the AG replication traffic)
- Private: Set to "Cluster Only."  The only communication going over this network should be the cluster-related traffic (that might be health detection / heartbeats, updates between nodes, checkpoint data, etc)
- Public: Set to "Cluster and Client."  "Application" traffic will be routed over this network.  That includes SSMS

This part is clearly not working exactly right.  Let's check the cluster log:

## Digging Deeper

Looking the cluster log, I saw this error message:

> 000015c8.00000d44::2021/02/24-19:35:36.070 ERR   [RES] IP Address <App1AG_172.16.0.11>: IpaValidatePrivateResProperties: Network 8674967e-aef4-4815-8567-cd7bd15ebc1e with network role (1) does not allow IP address resources.

"172.16.0.11" is in the range for Node 3 (in "data center 2") in this setup.  So the listener creation appeared to work in the "data center 1" subnet, but the second IP failed.  

It turns out that error means that my request to create a listener was routed to a cluster network that is marked for "Cluster Only" communication (thanks, Sean!).  I can confirm this by looking at the AG resource identifiers using PowerShell:

    Get-ClusterNetwork | fl *

Among all the results, I found the same GUID indicated above:

    Address           : 172.16.0.0
    AddressMask       : 255.248.0.0
    AutoMetric        : True
    Cluster           : cluster1
    Description       :
    Id                : 8674967e-aef4-4815-8567-cd7bd15ebc1e
    Ipv4Addresses     : {172.16.0.0}
    Ipv4PrefixLengths : {13}
    Ipv6Addresses     : {}
    Ipv6PrefixLengths : {}
    Metric            : 30241
    Name              : DC2 Private Traffic
    Role              : Cluster
    State             : Up

This shows that the command to create the AG listener was being routed to the "DC2 Private Traffic" network, which is marked as "Cluster Only."  The Cluster should be able to put this on "DC2 Public Traffic" - so why isn't it?

## Computers Are Hard

As it turns out, these subnet definitions for DC2 overlap with one another:

 - 172.16.0.0/12 has a range of 172.16.0.1 ➡ 172.31.255.254
 - 172.17.0.0/13 has a range of 172.16.0.1 ➡ 172.23.255.254
 - 172.18.0.0/14 has a range of 172.16.0.1 ➡ 172.19.255.254

Because these networks overlap, the routing of traffic to the defined cluster networks is non-deterministic.  In fact, Ryan hinted at that with his comment in the listener creation code, which mentioned:

> You might also have to turn the AG networks to client and cluster and then turn them back to none post-listener creation

That certainly works as a temporary solution, but the solution in the end was to switch all the networks to a /16 (255.255.0.0) range, so that they don't overlap.

## In Conclusion

If you run into error code 5054, double check your networks - that they don't overlap, and that your cluster networks are defined to allow the right types of traffic.  Happy AG-ing!

[1]: https://www.ryanjadams.com/2019/10/build-a-sql-cluster-lab-part-1/
[2]: {{ site.url }}/assets/2021-04-07-lab-architecture-1.png
[3]: https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes--4000-5999-
[4]: https://www.seangallardy.com/
[5]: {{ site.url }}/assets/2021-04-07-cluster-networks.png