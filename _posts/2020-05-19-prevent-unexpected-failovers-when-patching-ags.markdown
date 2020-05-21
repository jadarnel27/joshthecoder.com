---
layout: post
title:  "Prevent Unexpected Failovers When Patching AGs"
categories: 
tags: 
---

<style type="text/css">
    pre.highlight {
        white-space: pre-wrap;
    }
</style>

I had a 2-node availability group (AG) + fileshare witness system experience an unexpected failover recently.  

The synchronous secondary was being patched, and when it came back up from a reboot, the current primary unexpectedly failed over.  We weren't done with all the patching on the secondary, so this caused a short outage, and we had to fail back to the original primary to finish the patching (which is of course another short interruption in availability).

The root cause was interesting enough that I decided to share the story here, and provide some general advice and debugging tips along the way.

If anyone ever tells you "AGs are easy" please send them to this web page 😉

## The Basic Timeline

The story starts with an expected, manual failover from SVR13 to SVR14, as SVR13 needs to be patched.  So SVR14 is the primary, SVR13 is the secondary.

Here's the general sequence of events that occurred after that:

- 21:00:00 SVR13 is rebooted for Windows Updates
- 21:16:10 SVR13 comes back up - it is still the secondary.  Additional driver and VM-related updates are installed
- 21:17:52 SVR14 goes from primary to RESOLVING - the AG databases are now offline unexpectedly
- 21:18:00 SVR13 is rebooted
- 21:18:37 SVR13 comes back up - it is now the primary
- 21:18:43 The AG databases are available again on SVR13, now that crash recovery has completed
- 21:18:57 SVR14 goes from RESOLVING to secondary

Fortunately, this only resulted in about a minute (51 seconds) of downtime.  Woohoo, five nines, etc 😀

So what in the wide world of sports happened there?  Why did patches / a reboot on the secondary seemingly cause the primary to lose its shit?

Isn't the whole point of AGs to allow us to do maintenance on a secondary without impacting the primary significantly?

Furthermore, we've been patching like this on the server for 3+ years now without any issues.  Well, okay - there was [one issue][1].

## Too Long, Didn't Read

Below is a pretty deep dive into the cluster log, and exactly what happened in this specific case.  The general conclusion I came to is that 

- automatic failover needs to be disabled on all sync replicas in the AG before patching begins
- each node needs to be "paused" in the Failover Cluster Manager prior to patching, and "resumed" afterwards

For how to do that, jump ahead to [How To Do Better](#HowToDoBetter).

## Beginning the Investigation

There was nothing much of interest in the SQL Server error log, just the usual failover related messages, like this on SVR14:

> Always On: The local replica of availability group 'myAgName' is preparing to transition to the resolving role in response to a request from the Windows Server Failover Clustering (WSFC) cluster. This is an informational message only. No user action is required.

Thus I grabbed the cluster logs (using [`Get-ClusterLog`][2] to grab the logs for both nodes, for the time range that included my failover, in local time).

    Get-ClusterLog -TimeSpan 300 -UseLocalTime

Using information from the cluster log on both nodes, we can begin to construct a timeline of what happened.

I'd like to push pause here to say a huge "Thank you!" to my friend [Sean Gallardy][3], who walked me through these logs, and provided a technical review of this post - thanks, Sean!

## Detailed Cluster Log Analysis

### SVR14 (Node 1)

Since I'm really curious about why SVR14 went into the RESOLVING state at 21:17:52, I'm going to start with the notable items from that server's cluster log.

Here we’re getting a connection from node 13.  MM stands for "Membership Manager" and NETFTAPI stands for "Network Fault Tolerant driver."  We also learn here that SVR14 is identified as "Node 1," while SVR13 is "Node 2."

    21:16:17.256 INFO  [ACCEPT] 0.0.0.0:~3343~: Accepted inbound connection from remote endpoint XX.X.1.X13:~49183~.
    21:16:17.288 DBG   [NETFTAPI] Signaled NetftRemoteReachable event, local address XX.X.1.X14:3343 remote address XX.X.1.X13:3343
    21:16:17.288 INFO  [MM] Node 1: Adding a stream to existing node 2

Here node 1 (SVR14) is saying it sees a connection from node 2 (SVR13).

The way clustering works is that someone proposes a view, and, if there is an agreement, the view of the cluster is accepted and emitted.  In this case, the old view was node 1 only saw node 1, and the cluster only had node 1.

The new view is node 1 sees node 1 *and* 2, and the new view of the cluster (should it be accepted) is node 1 and 2.

These related messages are prefixed by "RGP" which stands for "Regroup of cluster view."  And most of the above information is encoded in the `ViewChanged` XML fragment in the log messages below.

Note that node 2 is *joining* (`joiner=(2)`) the cluster membership and the cluster is NOT being formed (`form=false`), since it was already up and running.

    21:16:17.288 INFO  [RGP] node 1: Node Connected 2 00000000000000000000000000000000000000000000000000000000000000110
    21:16:17.288 INFO  [RGP] sending to node(2) 1: 902(1) => 902(1) +() -() [()]
    21:16:17.913 INFO  [RGP] node 1: MergeAndRestart +(2) -()
    21:16:17.913 INFO  [RGP] sending to all nodes 1: 902(1) => 1101(1 2) +(2) -() [(1)]
    21:16:17.913 INFO  [CORE] Node 1: Proposed View is <ViewChanged joiners=(2) downers=() newView=1101(1 2) oldView=902(1) joiner=false form=false/>
    21:16:18.225 INFO  [RGP] node 1: emit view 1101(1 2)
    21:16:18.225 INFO  [GEM] Node 1: Pause (proposedView = 1101(1 2), currentView = 902(1), joiners = (2), InSteadyState = true)

SVR14 checks the current paxos tag from this local clusterdb.  The paxos tag represents major changes that have happened to the cluster configuration, and is one of the ways nodes agree on the state of the cluster.  [This old Microsoft KB][4] has some nice details on paxos tags (it's about 2008 but appears to be generally correct for 2012 - information about this is hard to come by!).

The important thing to know is that each node has a copy of this value, as well as the fileshare witness.

    21:16:18.538 INFO  [DM] Paxos Tag Read from Hive: 86:86:31888

Node 2 (SVR13) has basically now joined the cluster

    21:16:18.631 INFO  [NODE] Node 1: New join with n2: stage: 'Join Succeeded'

Life is good at this point!  

But, about a minute and a half later, we lose network connectivity between the nodes, which we see in these "missed heartbeat" messages.

    21:17:43.284 INFO  [IM] got event: LocalEndpoint XX.X.1.X14:~3343~ has missed two consecutive heartbeats from XX.X.1.X13:~3343~
    21:17:43.284 INFO  [CHM] Received notification for two consecutive missed HBs to the remote endpoint XX.X.1.X13:~3343~ from XX.X.1.X14:~3343~

About 3 seconds later, SVR14 gets a new inbound connection from SVR13, but it's immediately lost.

    21:17:46.284 INFO  [ACCEPT] 0.0.0.0:~3343~: Accepted inbound connection from remote endpoint XX.X.1.X13:~49258~.
    21:17:46.284 INFO  [CHANNEL XX.X.1.X13:~49258~] graceful close, status (of previous failure, may not indicate problem) (0)

5 seconds later, SVR14 officially declares the route to node 2 is *down*.

    21:17:51.284 DBG   [NETFTAPI] Signaled NetftRemoteUnreachable event, local address XX.X.1.X14:3343 remote address XX.X.1.X13:3343
    21:17:51.284 INFO  [IM] got event: Remote endpoint XX.X.1.X13:~3343~ unreachable from XX.X.1.X14:~3343~
    21:17:51.284 INFO  [IM] Marking Route from XX.X.1.X14:~3343~ to XX.X.1.X13:~3343~ as down
 
Since we can't talk to node 2 anymore, propose a new view to the cluster with *only* node 1.

    21:17:51.284 INFO  [RGP] node 1: Node Disconnected 2 00000000000000000000000000000000000000000000000000000000000000010
    21:17:51.909 INFO  [RGP] sending to 64 nodes 1: 1301(1) => 1301(1) +() -() [()]
    21:17:51.909 INFO  [GEM] Node 1: Pause (proposedView = 1301(1), currentView = 001(1), joiners = (), InSteadyState = true)
    21:17:51.909 INFO  [CORE] Node 1: New View is <ViewChanged joiners=() downers=(2) newView=1301(1) oldView=1101(1 2) joiner=false form=false/> (Start Dispatch)
 
At this point, SVR14 needs to see if it has quorum (since SVR13 is gone from its point of view).  So it updates its local paxos tag.

    21:17:51.909 INFO  [QUORUM] Node 1: Node will remain up, network connectivity is assumed to be available.
    21:17:51.909 INFO  [QUORUM] Node 1: retaining witness lock (if held) because a Paxos Tag update is expected or nodes not in view may arbitrate.
    21:17:51.909 INFO  [QUORUM] Node 1: Updating next and last epoch due to reaching quorum or an active node going down
    21:17:51.909 INFO  [QUORUM] Node 1: Updating next paxos epoch to 87
    21:17:51.909 INFO  [DM] Paxos tag updated to 87:86:31906

Now it reaches out to the fileshare witness to get a lock on the file (in order to check the tag, and then update it with the new state of the cluster):

    21:17:51.909 INFO  [QUORUM] Node 1: Updating witness paxos tag to 87:86:31906
    21:17:51.909 INFO  [QUORUM] Node 1 CompareAndSetWitnessTag: reading witness tag.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Reading file share witness epoch data.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Re-arbitrating for file share witness since lock is currently released.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Opening file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Attempting to lock file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log, try 1 of 30.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Succeeded in locking file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Read 88 bytes from the witness file share.
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Retaining lock on witness file share until explicitly released.

It got the lock, so now it tries to update the tag:

    21:17:51.909 INFO  [QUORUM] Node 1 CompareAndSetWitnessTag: Attempting to update witness tag (87:87:31907) to 87:86:31906.
    21:17:51.909 WARN  [QUORUM] Node 1 CompareAndSetWitnessTag: witness tag (87:87:31907) is better than proposed tag (87:86:31906).
    21:17:51.909 INFO  [QUORUM] Node 1 CompareAndSetWitnessTag: releasing witness share lock
    21:17:51.909 INFO  [RES] File Share Witness <File Share Witness>: Releasing locked witness share.

***Gasp!***  Something else got their first - you can see the witness tag (`87:87:31907`) is higher than the local tag from SVR14 (`87:86:31906`).  This means that another node is up, *and* it's already updated the paxos tag on the witness, resulting in this error in the cluster log:

    21:17:51.909 ERR   Quorum lost because failed to update witness epoch after node failure (status = 5925)

In other words, the cluster node on SVR14 needs to shut itself down in order to prevent a split brain scenario.  Which is what it does:

    21:17:51.909 INFO  [NETFT] Cluster Service preterminate succeeded.
    21:17:51.909 WARN  [RHS] Cluster service has terminated. Cluster.Service.Running.Event got signaled.
    21:17:51.909 WARN  [RHS] Cluster service has terminated. Cluster.Service.Running.Event got signaled.

SVR14 went into the resolving state just just after this (21:17:52), and wow we know it was because:

- it lost its network connection to SVR13
- it found that another node had successfully connected to the fileshare witness, and thus was up and running
- so it "down"ed itself

There's no evidence of network disconnects on SVR14, in the cluster or Windows Event log.  So what happened on SVR13 to cause the disconnect?

### SVR13 (Node 2)

Going back to the beginning, here we can see the other side of SVR13 making its initial connection to SVR14 after coming up from a reboot, with similar `ViewChanged` and connect messages.

    21:16:18.436 INFO  [CORE] Node 2: New View is <ViewChanged joiners=(2) downers=() newView=002(2) oldView=000() joiner=true form=true/> (Start Dispatch)
    21:16:18.436 INFO  [CONNECT] XX.X.1.X14:~3343~: Established connection to remote endpoint XX.X.1.X14:~3343~.
    21:16:18.436 INFO  [NODE] Node 2: New join with n1: stage: 'Attempt Initial Connection'
    21:16:18.436 DBG   [SM] Joiner: Initialized with SPN = SVR14, RequiredCtxAttrib = 1, HandShakeTimeout = 40000

Now SVR13 (node 2) checks its local paxos tag, to see if it needs to get quorum.

    21:16:18.436 INFO  [JPM] Node 2: Found possible contact address XX.X.1.X14:~0~ for node SVR14 via DNS.
    21:16:18.436 INFO  [QUORUM] Node 2: received request for quorum info. Replying with quorum state <QuorumConfig tag='85:85:31879' set='(0 1 2)' weights='(0 1 2)'/>
    21:16:18.436 INFO  [QUORUM] Node 2: setting next best epoch to 85
    21:16:18.436 INFO  [QUORUM] Node 2: The best quorum config so far is from node 2: <QuorumConfig tag='85:85:31879' set='(0 1 2)' weights='(0 1 2)'/>
    21:16:18.436 INFO  [QUORUM] Node 2: Coordinator: one off quorum, need to arbitrate
    21:16:18.436 INFO  [QUORUM] Node 2: I am the form/join leader (responsible for state xfer to other nodes)
    21:16:18.436 INFO  [QUORUM] Node 2: Form Leader: one off quorum

This corresponds with the RGP (regroup cluster view) that happened on SVR14.  Since it just go connected, it needs to see if the proposed view can be accepted.

Some of the plain English messaging here is really nice.  We can see that SVR13 accepts the view from SVR14.

    21:16:18.467 INFO  [RGP] node 2: Node Connected 1 00000000000000000000000000000000000000000000000000000000000000110
    21:16:18.780 INFO  [RGP] node 2: selected partition 902(1) as node 1 has quorum
    21:16:18.780 INFO  [RGP] node 2: selected partition 902(1) to join [using info from 1]
    21:16:18.780 INFO  [RGP] node 2: MergeAndRestart +(2) -()
    21:16:19.092 INFO  [RGP] node 2: I don't have quorum, but node 1 in my view has it
    21:16:19.092 INFO  [RGP] node 2: considering shortcut for stragglers (1)
    21:16:19.092 INFO  [RGP] node 2: I see no issue with 1. no shortcut
    21:16:19.092 INFO  [RGP] sending to 64 nodes 2: 902(1) => 1002(1 2) +(2) -() [(2)]
    21:16:19.092 INFO  [RGP] node 2: received new information from 1 starting the timer
    21:16:19.092 INFO  [RGP] node 2: We have identical views, but his vid is better. Adopting
    21:16:19.092 INFO  [RGP] node 2: FAULTS ARE , conn are (1 2) fr ()
    21:16:19.092 INFO  [RGP] node 2: my state 2: 902(1) => 1101(1 2) +(2) -() [(1)]
    21:16:19.092 INFO  [CORE] Node 2: Proposed View is <ViewChanged joiners=(1) downers=() newView=1101(1 2) oldView=002(2) joiner=false form=false/>
    21:16:19.405 INFO  [GEM] Node 2: Pause (proposedView = 1101(1 2), currentView = 902(1), joiners = (2), InSteadyState = true)

Now SVR13 has successfully joined to the cluster.

    21:16:19.717 INFO  [NODE] Node 2: New join with n1: stage: 'Reporting Ready for Form/Join State Transfer'
    21:16:19.717 INFO  [QUORUM] Node 2: offline, but not a lowest number node. Don't do anything
    21:16:19.717 INFO  [NODE] Node 2: New join with n1: stage: 'Join Succeeded'
    21:16:19.733 INFO  [DM] Paxos Tag Read from Hive: 86:86:31888

Uh oh...someone has requested a system shutdown.  This is because SVR13 is the secondary, and a second round of patching is still going on.

    21:16:19.733 INFO  Shutdown lock acquired, proceeding with shutdown

There are a few more messages about successfully connecting to the cluster.

    21:16:23.452 INFO  [QUORUM] Node 2: view has changed. form worker goes away
    21:16:23.452 INFO  [QUORUM] Node 2: Form Leader: Cancelling arbitrate thread

These messages relate to SVR13 updating its local state so that is all caught up with SVR14.  I don't really know much about *what* information is being updated here.

    21:16:24.249 INFO  [GUM] Node 2: Executing locally gumId: 357, updates: 1, first action: /dm/update
    21:16:24.249 INFO  [GUM] Node 2: Executing locally gumId: 358, updates: 1, first action: /dm/update
    21:16:31.124 INFO  [GUM] Node 2: Executing locally gumId: 359, updates: 1, first action: /dm/update
    21:16:31.139 INFO  [GUM] Node 2: Executing locally gumId: 360, updates: 1, first action: /dm/update
    21:16:31.155 INFO  [GUM] Node 2: Executing locally gumId: 361, updates: 1, first action: /dm/update
    21:16:32.139 INFO  [GEM] Node 2: Deleting [1:174 , 1:176] (both included) as it has been ack'd by every node
    21:16:37.904 INFO  [NM] Received request from client address SVR13.
    21:16:42.331 INFO  [GUM] Node 2: Executing locally gumId: 362, updates: 1, first action: /dm/update
    21:16:43.328 INFO  [GEM] Node 2: Deleting [1:177 , 1:177] (both included) as it has been ack'd by every node

Suddenly, SVR13 loses its network connection.  This is about 2 seconds before SVR14 reports losing sight of SVR13.

    21:17:41.708 DBG   [NETFTAPI] received NsiDeleteInstance for fe80::40bb:a342:8159:3a48
    21:17:41.708 WARN  [NETFTAPI] Failed to query parameters for fe80::40bb:a342:8159:3a48 (status 0x80070490) -- ERROR_NOT_FOUND
    21:17:41.708 DBG   [NETFTAPI] Signaled NetftLocalRemove event for fe80::40bb:a342:8159:3a48
    21:17:41.724 INFO  [IM] got event: Remote endpoint XX.X.1.X14:~3343~ unreachable from XX.X.1.X13:~3343~
    21:17:41.724 INFO  [IM] Marking Route from XX.X.1.X13:~3343~ to XX.X.1.X14:~3343~ as down

Because of the disconnect, node 1 (SVR13) now believes node 2 is down (from its view).

    21:17:41.724 INFO  [RGP] node 2: Node Disconnected 1 00000000000000000000000000000000000000000000000000000000000000100
    21:17:41.724 INFO  [RGP] node 2: MergeAndRestart +() -()

At this point, there are also a bunch of suspicious errors about the IPv6 interface not being found:

    21:17:41.740 DBG   [NETFTAPI] received NsiDeleteInstance for fe80::5efe:XX.X.1.X13
    21:17:41.740 WARN  [NETFTAPI] Failed to query parameters for fe80::5efe:XX.X.1.X13 (status 0x80070490)
    21:17:41.740 DBG   [NETFTAPI] Signaled NetftLocalAdd event for fe80::5efe:XX.X.1.X13
    21:17:41.755 WARN  [NETFTAPI] Failed to query parameters for fe80::5efe:XX.X.1.X13 (status 0x80070490)
    21:17:41.755 DBG   [NETFTAPI] Signaled NetftLocalRemove event for fe80::5efe:XX.X.1.X13
    21:17:41.786 DBG   [NETFTAPI] received NsiDeleteInstance for fe80::5efe:169.254.2.243
    21:17:41.786 WARN  [NETFTAPI] Failed to query parameters for fe80::5efe:169.254.2.243 (status 0x80070490)
    21:17:41.786 DBG   [NETFTAPI] Signaled NetftLocalAdd event for fe80::5efe:169.254.2.243
    21:17:41.786 WARN  [NETFTAPI] Failed to query parameters for fe80::5efe:169.254.2.243 (status 0x80070490)

That was suspicious enough that I correlated the time with the Windows Event Viewer, and discovered these messages:

> The TCP/IP NetBIOS Helper service was successfully sent a stop control. The reason specified was: 0x40030011 [Operating System: Network Connectivity (Planned)] Comment: None
> 
> The TCP/IP NetBIOS Helper service entered the running state.

Digging a little deeper, I discovered that the network card driver had been updated in that moment!  This explains the disconnects going on here.
 
SVR13 decides to become an army of one, and proposes a new view that it only sees itself.

Notice `downers=(1)` in the new view of things.  Yes, Cluster Service, this is starting to be a real downer.

    21:17:42.347 INFO  [RGP] node 2: GoSingleton
    21:17:42.347 INFO  [RGP] node 2: emit view 1302(2)
    21:17:42.347 INFO  [RGP] sending to 64 nodes 2: 1302(2) => 1302(2) +() -() [()]
    21:17:42.347 INFO  [GEM] Node 2: Pause (proposedView = 1302(2), currentView = 002(2), joiners = (), InSteadyState = true)
    21:17:42.347 INFO  [CORE] Node 2: New View is <ViewChanged joiners=() downers=(1) newView=1302(2) oldView=1101(1 2) joiner=false form=false/> (Start Dispatch)
    21:17:42.347 INFO  [MRR] Node 2: Process view 1302(2)
 
Because this is a major change in the cluster, SVR13 is going to update the paxos tag.  It also begins the process of arbitrating for quorum.  I'm not sure what this "death timer" is, but it sure sounds ominous.

    21:17:42.347 INFO  [GUM] Node 2: one of the active nodes went down, epoch change is required
    21:17:42.347 INFO  [QUORUM] Node 2: Node will remain up, network connectivity is assumed to be available.
    21:17:42.347 INFO  [QUORUM] Node 2: quorum resource owner 1 died
    21:17:42.347 WARN  [QUORUM] Node 2: One off quorum (2)
    21:17:42.347 INFO  [QUORUM] Node 2: death timer is started at 2020/05/12-01:17:42.347 and expires in 90 seconds

This is an interesting little note that SVR13 has decided to *wait* on updating its paxos tag until it can reach the witness.

    21:17:42.347 INFO  [QUORUM] Node 2: Delaying update of next and last epoch until witness is arbitrated and we have quorum. Current view: 1302:00000000000000000000000000000000000000000000000000000000000000100

And now it wants to take ownership of the core cluster resources.

    21:17:42.347 INFO  [RCM] move of group Cluster Group from SVR13(2) to SVR13(2) of type MoveType::NodeDown is about to succeed, failoverCount=0, lastFailoverTime=1601/01/01-00:00:00.000 targeted=false

The arbitration process has begun!

    21:17:42.347 INFO  [RCM] Res File Share Witness: Offline -> OnlineCallIssued( StateUnknown )
    21:17:42.347 INFO  [RCM] TransitionToState(File Share Witness) Offline-->OnlineCallIssued.
    21:17:42.347 INFO  rcm::RcmResource::OnlineWorker[RCM] Issuing Arbitrate(File Share Witness) to RHS.
    21:17:42.347 INFO  [RHS] Enqueuing Arbitrate call.
    21:17:42.347 INFO  [RHS] Waiting for Arbitrate call to be dequeued.
    21:17:42.347 INFO  [RES] File Share Witness <File Share Witness>: Beginning arbitration ...
    21:17:42.347 INFO  [RES] File Share Witness <File Share Witness>: Obtaining the virtual server token from the core netname resource.

In an incident of terrible timing, SVR13 is able to connect to the file share witness moments after deciding that SVR14 is down.

However, there is a built-in 6-second "backoff" because the core cluster resources were just acquired.  This give the *previous* owner, who might actually be up, a chance to first get the arbitration win.  This is based on the idea that maybe SVR13 itself is the problem child.

    21:17:42.784 INFO  [RES] File Share Witness <File Share Witness>: Opening file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log.
    21:17:42.784 INFO  [RES] File Share Witness <File Share Witness>: Attempting to lock file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log, try 1 of 30.
    21:17:42.784 INFO  [RES] File Share Witness <File Share Witness>: Succeeded in locking file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log
    21:17:42.799 INFO  [QUORUM] Node 2: PostArbitrate => 0 for 6202f55b-61b8-4b4b-811f-3302f0847ad9
    21:17:42.799 INFO  [QUORUM] Node 2: Releasing lock and delaying witness arbitration 6 seconds to give current witness owner preference.
    21:17:42.799 INFO  [RES] File Share Witness <File Share Witness>: Releasing locked witness share.

Status update: still have 4 seconds to go in the backoff period.

    21:17:44.264 WARN  [QUORUM] Node 2: One off quorum (2)
    21:17:44.264 INFO  [QUORUM] Node 2: death timer is already running, 88 seconds left.

Continuing the bad timing dance, with 1 second to go in the backoff, we suddenly see node 1 (SVR14) again!

    21:17:47.258 WARN  [QUORUM] Node 2: One off quorum (2)
    21:17:47.258 INFO  [QUORUM] Node 2: death timer is already running, 85 seconds left.
    21:17:47.289 INFO  [CONNECT] XX.X.1.X14:~3343~: Established connection to remote endpoint XX.X.1.X14:~3343~.
    21:17:47.289 INFO  [SV] New real route: local (XX.X.1.X13:~49258~) to remote SVR14 (XX.X.1.X14:~3343~).
 
Scratch that, the connection is immediately lost 🤦‍♂️

    21:17:47.289 INFO  [CHANNEL XX.X.1.X14:~3343~] graceful close, status (of previous failure, may not indicate problem) (0)
    21:17:47.289 INFO  [CORE] Node 2: Clearing cookie d4ed3788-7946-4d2c-b4a4-e9bb88ff9e1f
    21:17:47.289 WARN  cxl::ConnectWorker::operator (): GracefulClose(1226)' because of 'channel to remote endpoint XX.X.1.X14:~3343~ is closed'

Let's take another quick detour to the Windows Event Viewer, where we see this nice message, letting is know that SVR13 is about to be rebooted.

As usual, VMs are the worst.

> The process msiexec.exe has initiated the restart of computer SVR13 on behalf of user NT AUTHORITY\SYSTEM for the following reason: No title for this reason could be found.  Reason Code: 0x80030002  Shutdown Type: restart  Comment: The Windows Installer initiated a system restart to complete or continue the configuration of 'VMware Tools'.

Okay, now we've hit the 6 second mark and SVR13 starts to try and establish quorum for real.  First, it attempts to get a lock on the witness:

    21:17:48.256 WARN  [QUORUM] Node 2: One off quorum (2)
    21:17:48.256 INFO  [QUORUM] Node 2: death timer is already running, 84 seconds left.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: reading witness tag.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Reading file share witness epoch data.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Re-arbitrating for file share witness since lock is currently released.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Opening file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Attempting to lock file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log, try 1 of 30.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Succeeded in locking file \\SVR23\QuorumProd\6202f55b-61b8-4b4b-811f-3302f0847ad9\Witness.log

The lock has been acquired, so now SVR13 checks its local paxos tag against the one on the witness.

    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Read 88 bytes from the witness file share.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Retaining lock on witness file share until explicitly released.
    21:17:48.802 WARN  [RCM] rcm::ChaseTheOwnerLoop::NoLockIsCallComplete: RCM is shutting down. Not chasing the owner on error 0.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: Attempting to update witness tag (86:86:31879) to 86:86:31907.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: writing witness tag 86:86:31907
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Writing file share witness epoch data.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Wrote 88 bytes to the witness file share.
    21:17:48.802 WARN  [RCM] rcm::ChaseTheOwnerLoop::NoLockIsCallComplete: RCM is shutting down. Not chasing the owner on error 0.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: retaining witness share lock because updates are not completed or because nodes not in view may attempt to arbitrate.
    21:17:48.802 INFO  [QUORUM] Node 2: quorum is arbitrated by node 2
    21:17:48.802 INFO  [QUORUM] Node 2: stopping death timer
    21:17:48.802 INFO  [RCM] regained quorum, restarting group distribution
    21:17:48.802 INFO  [DCM] UpdateClusDiskMembership (enter): ctl 300224 nodeSet (2)
    21:17:48.802 INFO  [DCM] UpdateClusDiskMembership: ctl 300224 nodeSet (2), status 0
    21:17:48.802 INFO  [QUORUM] Node 2: retaining witness lock (if held) because a Paxos Tag update is expected or nodes not in view may arbitrate.
    21:17:48.802 INFO  [GUM] Node 2: Epoch change is needed.
    21:17:48.802 INFO  [RCM] Successfully arbitrated quorum -- now bringing rest of group to persistent state.
    21:17:48.802 INFO  [DCM] UpdateClusDiskMembership (enter): ctl 300228 nodeSet (2)
    21:17:48.802 INFO  [RCM] Issuing Online(File Share Witness) to RHS.

The sequence number in the local paxos tag was "better," so SVR13 updates the witness and has successfully arbitrated for quorum.

Since this was a major change to the cluster configuration, the epoch portion of the paxos tag needs to be updated as well.  This update is why SVR14 ends up thinking that SVR13 is up and owns the cluster, and thus puts itself into the RESOLVING state.

    21:17:48.802 INFO  [QUORUM] Node 2: PostOnline for 6202f55b-61b8-4b4b-811f-3302f0847ad9
    21:17:48.802 INFO  [QUORUM] Node 2: Updating next and last epoch due to reaching quorum or an active node going down
    21:17:48.802 INFO  [QUORUM] Node 2: Updating next paxos epoch to 87
    21:17:48.802 INFO  [DM] Paxos tag updated to 87:86:31907
    21:17:48.802 INFO  [QUORUM] Node 2: Updating last paxos epoch to 87
    21:17:48.802 INFO  [DM] Paxos tag updated to 87:87:31907
    21:17:48.802 INFO  [QUORUM] Node 2: Updating witness paxos tag to 87:87:31907
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: reading witness tag.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Reading file share witness epoch data.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Read 88 bytes from the witness file share.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: Attempting to update witness tag (87:86:31907) to 87:87:31907.
    21:17:48.802 INFO  [QUORUM] Node 2 CompareAndSetWitnessTag: writing witness tag 87:87:31907
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Writing file share witness epoch data.
    21:17:48.802 INFO  [RES] File Share Witness <File Share Witness>: Wrote 88 bytes to the witness file share.

The final scene in this masterpiece is SVR13 shutting down .2 seconds after achieving quorum, and thus stealing the primary role and then taking the whole cluster offline.

    21:17:49.021 INFO  [DM]: Shutting down, so unloading the cluster database.
    21:17:49.021 INFO  [DM] Shutting down, so unloading the cluster database (waitForLock: true).
    21:17:49.021 INFO  [CS] Service Stopped...
    21:17:49.021 INFO  [CS] About to exit service...
    21:17:49.021 INFO  [NETFT] Cluster Service preterminate succeeded.
    21:17:49.021 WARN  [RHS] Cluster service has terminated. Cluster.Service.Running.Event got signaled.
    21:17:49.021 WARN  [RHS] Cluster service has terminated. Cluster.Service.Running.Event got signaled.

## An Updated Timeline

I found it helpful to bring the major events from both servers back into one sequence of events, now that we've seen the whole story.

- 21:16:10 SVR13 came back up from patching, after being down for 15 minutes or so
- 21:16:18 SVR13 successfully rejoins the cluster.  All is well.
- 21:17:41 The NIC driver on SVR13 is updated, causing the network connection to drop briefly.
- 21:17:42 Due to the network blip, SVR13 can’t “see” SVR14 anymore, and tries to check in with the file share witness.  The network is already back up, so this works – which is really bad timing.
- 21:17:43 SVR14 notices this disconnect, but doesn’t take any action yet
- 21:17:46 SVR14 briefly sees SVR13 again, but then loses the connection (again)
- 21:17:48 SVR13 basically gets control of the cluster and has notified the file share witness
- 21:17:49 The cluster service on SVR13 shuts down (in preparation for the server restart to complete the driver update)
- 21:17:51 SVR14 has decided it really can’t see SVR13 anymore, so checks with the witness to see who should be primary
- 21:17:51 SVR14 sees that the file share witness was just updated that SVR13 is the primary, so it disconnects from the cluster to prevent a “split brain” scenario

SVR14 was 3 seconds too late in getting to the file share to maintain its status as the primary server.  This is odd, since SVR13 gave SVR14 a 6 second head start.  It's tough to know why SVR14 didn't make its connection to the fileshare witness between 21:17:43 and 21:17:51 - maybe the CPUs were very busy during this 8 second period.

{: #HowToDoBetter}
## How To Do Better

As it turns out, part of this problem could have been avoided by following the first step in the docs related to ["rolling upgrades" of Availability Group servers][5]:

> 1. Remove automatic failover on all synchronous-commit replicas

This means running the following command on the primary server before doing the patching and reboots of the secondary:

    ALTER AVAILABILITY GROUP [myAgName]
    MODIFY REPLICA ON N'SVR13' WITH (FAILOVER_MODE = MANUAL);
    ALTER AVAILABILITY GROUP [myAgName]
    MODIFY REPLICA ON N'SVR14' WITH (FAILOVER_MODE = MANUAL);

Make sure to bring it back to normal after all the patching is done:

    ALTER AVAILABILITY GROUP [myAgName]
    MODIFY REPLICA ON N'SVR13' WITH (FAILOVER_MODE = AUTOMATIC);
    ALTER AVAILABILITY GROUP [myAgName]
    MODIFY REPLICA ON N'SVR14' WITH (FAILOVER_MODE = AUTOMATIC);

This would have stopped SVR13 from coming back up as the primary.

However, we still would have had a brief outage, because the fight for quorum, and ownership of the core cluster resources, all happened at the WSFC level.  To prevent *this* part of the outage, we need to "Pause" the node in the Cluster Manager:

[![Screenshot of failover cluster manager showing the pause node option][6]][6]

You could also use the [`Suspend-ClusterNode`][7] PowerShell cmdlet to avoid getting into the UI every time.

This is the responsibility of an administrator (*or* cluster-aware update automation tools) to make sure the patching is not disruptive.

Note: don't forget to "Resume" the node after patching has been completed.

Now, to be clear, we've been patching this system monthly, without unexpected failovers, for almost 4 years.  The timing really has to line up right for this problem to occur.  WSFC is pretty good at doing its thing.

But unexpected failovers are possible (obviously!), and to be safe this step should be added to AG patching routines per the documentation.

## Conclusion

Don't assume that just because something has always worked, that it means it always will work, or that it was even the right thing to do in the first place!  To be safe, always turn off automatic failover on all sync replicas before patching secondaries.  And pause / resume each cluster node during patching.

Hopefully this helps you out, and provides some more guidance online related to actually reading what is in the cluster log.

And again, thanks to Sean for helping out with the original problem, and reviewing this post!

[1]: https://www.joshthecoder.com/2018/12/03/always-run-rhs-in-separate-process.html
[2]: https://docs.microsoft.com/en-us/powershell/module/failoverclusters/get-clusterlog?view=win10-ps
[3]: https://www.seangallardy.com/
[4]: https://support.microsoft.com/en-us/help/947713/the-implications-of-using-the-forcequorum-switch-to-start-the-cluster
[5]: https://docs.microsoft.com/en-us/sql/database-engine/availability-groups/windows/upgrading-always-on-availability-group-replica-instances?view=sql-server-ver15#rolling-upgrade-process
[6]: {{ site.url }}/assets/2020-05-19-cluster-manager-pause-node.PNG
[7]: https://docs.microsoft.com/en-us/powershell/module/failoverclusters/suspend-clusternode?view=win10-ps