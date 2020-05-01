---
layout: post
title:  "Troubleshooting a Paging Query"
categories: 
tags: 
---

I got an alert the other day about a query that was waiting on `CXCONSUMER` for several seconds.  Tracking down the query, it looked a lot like this:

  SELECT 
      [Extent1].[Id] AS [Id], 
      [Extent1].[CreationDate] AS [CreationDate], 
      [Extent1].[PostId] AS [PostId], 
      [Extent1].[Score] AS [Score], 
      [Extent1].[Text] AS [Text], 
      [Extent1].[UserId] AS [UserId]
  FROM [dbo].[Comments] AS [Extent1]
  ORDER BY row_number() OVER (ORDER BY [Extent1].[Score] ASC)
  OFFSET 3907440 ROWS FETCH NEXT 20 ROWS ONLY;

This query came from a list page, where the user can dynamically sort by any column, and then page through the results 20 at a time.  In this case, the user sorted by "Score" and then pressed the "last page" button to go to the very last page of results (that's page 195,373).

Here's the execution plan, when the query is run against the 2010 version of the Stack Overflow database:

[[Screenshot of the execution plan][1]][1]

That's basically a worst-case scenario for the query.  It scans the entire clustered index, then sorts all of the results, assigns row numbers to all 3.9 million rows, and then takes the first 20.

Some might call that "not ideal" or "wasteful."  Or, you know, a real train wreck.

I tried adding an index on "Score" but it doesn't change the plan:

  CREATE NONCLUSTERED INDEX IX_Score 
  ON dbo.[Comments] (Score);

Turns out the optimizer doesn't like the sound of 3.9 million key lookups.  I could make it covering, but that's not very realistic (in this case it would have to include every column in the table).

So what do we do about this situation?  It's not ideal.  There's no magic way to deal with paging queries like this - as the offset gets larger, the query takes longer.  There are some really great blog posts out there about this topic:

[Optimising Server-Side Paging - Part I](https://www.sqlservercentral.com/articles/optimising-server-side-paging-part-i)  
[Pagination with OFFSET / FETCH : A better way](https://sqlperformance.com/2015/01/t-sql-queries/pagination-with-offset-fetch)

Well [Paul White][2] recently suggested to me another solution.  The basic idea is that once you get into the 2nd half of the pages, you start searching from the end of the index.  Here's what that looks like:

[1]: {{ site.url }}/assets/2019-09-06-initial-plan.PNG
[2]: https://www.sql.kiwi/

---

 - NHibernate query based on dynamic sort column
 - server side paging with top N
 - row goal results in parallel plan
   - row goal is a total bust (link to Erik's blog about searching for what's not there)
 - Window function approach to pagin (NH) results in serial zone
   - Which means CXCONSUMER as a sign of this issue



REPRO
=====

CREATE OR ALTER PROCEDURE #sp_WeirdQuery
	@p1 AS int,
	@p0 AS int
AS
SELECT TOP (@p0) 
	...just grid columns?...
FROM 
(
	select 
		...all columns..., 
		ROW_NUMBER() OVER(ORDER BY referral0_.DonorNbr) as __hibernate_sort_row 
	from [Referral] referral0_
) as query 
WHERE 
	query.__hibernate_sort_row > @p1 
ORDER BY query.__hibernate_sort_row;
GO

EXEC #sp_WeirdQuery @p1 = 88920, @p0 = 20;

Note: 88920 represents the "last page", so the entire clustered index is read.

Plan XML:

<?xml version="1.0" encoding="utf-16"?>
<ShowPlanXML xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="1.518" Build="13.0.5337.0" xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple StatementCompId="3" StatementEstRows="20" StatementId="1" StatementOptmLevel="FULL" CardinalityEstimationModelVersion="130" StatementSubTreeCost="5.69574" StatementText="SELECT TOP (@p0) &#xD;&#xA;	Id21_, Version21_, FollowUp3_21_, Referral4_21_, DonorNbr21_, CdsTissu6_21_, UnosNbr21_, Referral8_21_, Referral9_21_, Referra10_21_, Discard11_21_, IsTissu12_21_, IsShare13_21_, Patient14_21_, Patient15_21_, Patient16_21_, Patient17_21_, DateOfB18_21_, Age21_, Gender21_, Race21_, DonorWe22_21_, TimeOfD23_21_, TimeofD24_21_, Hospita25_21_, Hospita26_21_, CauseOf27_21_, Circums28_21_, FirstPe29_21_, FirstPe30_21_, IsResea31_21_, Medical32_21_, Funeral33_21_, Funeral34_21_, Funeral35_21_, NextOfK36_21_, NextOfK37_21_, Current38_21_, Funeral39_21_, IsSuita40_21_, IsSuita41_21_, IsSuita42_21_, IsSuita43_21_, IsSuita44_21_, IsSuita45_21_, IsSuita46_21_, IsSuita47_21_, IsSuita48_21_, IsSuita49_21_, IsSuita50_21_, IsSuita51_21_, IsSuita52_21_, IsSuita53_21_, IsSuita54_21_, IsSuita55_21_, IsSuita56_21_, Suitabl57_21_, Suitabl58_21_, Suitabl59_21_, Suitabl60_21_, Suitabl61_21_, Suitabl62_21_, LegacyD63_21_, Coordin64_21_, EyeHour65_21_, TissueH66_21_, OutcomeEye21_, Outcome68_21_, Outcome69_21_, Outcome70_21_, IsActive21_, Created72_21_, Modifie73_21_, Referri74_21_, NextOfK75_21_, NextOfK76_21_, Importe77_21_, Authori78_21_, DonorPr79_21_, Recovery80_21_, Procure81_21_, Referri82_21_, Coordin83_21_, TissueR84_21_, DonorRe85_21_, CreatedBy86_21_, ModifiedBy87_21_ &#xD;&#xA;FROM &#xD;&#xA;(&#xD;&#xA;	select &#xD;&#xA;		referral0_.Id as Id21_, referral0_.Version as Version21_, referral0_.FollowUpDate as FollowUp3_21_, referral0_.ReferralNbr as Referral4_21_, referral0_.DonorNbr as DonorNbr21_, referral0_.CdsTissueNbr as CdsTissu6_21_, referral0_.UnosNbr as UnosNbr21_, referral0_.ReferralSource as Referral8_21_, referral0_.ReferralType as Referral9_21_, referral0_.ReferralStatus as Referra10_21_, referral0_.DiscardReason as Discard11_21_, referral0_.IsTissuePending as IsTissu12_21_, referral0_.IsSharedCase as IsShare13_21_, referral0_.PatientNameFirst as Patient14_21_, referral0_.PatientNameLast as Patient15_21_, referral0_.PatientNameMiddleInitial as Patient16_21_, referral0_.PatientNameSuffix as Patient17_21_, referral0_.DateOfBirth as DateOfB18_21_, referral0_.Age as Age21_, referral0_.Gender as Gender21_, referral0_.Race as Race21_, referral0_.DonorWeight as DonorWe22_21_, referral0_.TimeOfDeath as TimeOfD23_21_, referral0_.TimeofDeathType as TimeofD24_21_, referral0_.HospitalUnit as Hospita25_21_, referral0_.HospitalPhone as Hospita26_21_, referral0_.CauseOfDeathPrelim as CauseOf27_21_, referral0_.CircumstanceOfDeath as Circums28_21_, referral0_.FirstPersonConsent as FirstPe29_21_, referral0_.FirstPersonConsentType as FirstPe30_21_, referral0_.IsResearchAuthorized as IsResea31_21_, referral0_.MedicalExaminerCase as Medical32_21_, referral0_.FuneralHomePhone as Funeral33_21_, referral0_.FuneralHomeContacted as Funeral34_21_, referral0_.FuneralHomeContactDate as Funeral35_21_, referral0_.NextOfKinPrimaryDesiresCorrespondence as NextOfK36_21_, referral0_.NextOfKinSecondaryDesiresCorrespondence as NextOfK37_21_, referral0_.CurrentActionItem as Current38_21_, referral0_.FuneralHomeName as Funeral39_21_, referral0_.IsSuitableEyes as IsSuita40_21_, referral0_.IsSuitablePoles as IsSuita41_21_, referral0_.IsSuitableBone as IsSuita42_21_, referral0_.IsSuitableSkinFull as IsSuita43_21_, referral0_.IsSuitableSkinSplit as IsSuita44_21_, referral0_.IsSuitableHV as IsSuita45_21_, referral0_.IsSuitableSV as IsSuita46_21_, referral0_.IsSuitableFV as IsSuita47_21_, referral0_.IsSuitableAI as IsSuita48_21_, referral0_.IsSuitableSternumCostalCartilage as IsSuita49_21_, referral0_.IsSuitableEyeResearch as IsSuita50_21_, referral0_.IsSuitableOther1 as IsSuita51_21_, referral0_.IsSuitableOther2 as IsSuita52_21_, referral0_.IsSuitableOther3 as IsSuita53_21_, referral0_.IsSuitableOtherResearch1 as IsSuita54_21_, referral0_.IsSuitableOtherResearch2 as IsSuita55_21_, referral0_.IsSuitableOtherResearch3 as IsSuita56_21_, referral0_.SuitableOther1Description as Suitabl57_21_, referral0_.SuitableOther2Description as Suitabl58_21_, referral0_.SuitableOther3Description as Sui" StatementType="SELECT" QueryHash="0x60363BB3D7AA2524" QueryPlanHash="0xA5C18FC262D8DD50" RetrievedFromCache="false" SecurityPolicyApplied="false">
          <StatementSetOptions ANSI_NULLS="true" ANSI_PADDING="true" ANSI_WARNINGS="true" ARITHABORT="true" CONCAT_NULL_YIELDS_NULL="true" NUMERIC_ROUNDABORT="false" QUOTED_IDENTIFIER="true" />
          <QueryPlan DegreeOfParallelism="2" MemoryGrant="221488" CachedPlanSize="240" CompileTime="6" CompileCPU="6" CompileMemory="680">
            <ThreadStat Branches="3" UsedThreads="5">
              <ThreadReservation NodeId="0" ReservedThreads="6" />
            </ThreadStat>
            <MemoryGrantInfo SerialRequiredMemory="512" SerialDesiredMemory="220520" RequiredMemory="1472" DesiredMemory="221488" RequestedMemory="221488" GrantWaitTime="0" GrantedMemory="221488" MaxUsedMemory="70176" MaxQueryMemory="3808768" />
            <OptimizerHardwareDependentProperties EstimatedAvailableMemoryGrant="1048576" EstimatedPagesCached="131072" EstimatedAvailableDegreeOfParallelism="2" MaxCompileMemory="15520632" />
            <TraceFlags IsCompileTime="true">
              <TraceFlag Value="3226" Scope="Global" />
              <TraceFlag Value="7745" Scope="Global" />
              <TraceFlag Value="7752" Scope="Global" />
            </TraceFlags>
            <TraceFlags IsCompileTime="false">
              <TraceFlag Value="3226" Scope="Global" />
              <TraceFlag Value="7745" Scope="Global" />
              <TraceFlag Value="7752" Scope="Global" />
            </TraceFlags>
            <WaitStats>
              <Wait WaitType="SOS_SCHEDULER_YIELD" WaitTimeMs="11" WaitCount="305" />
              <Wait WaitType="RESERVED_MEMORY_ALLOCATION_EXT" WaitTimeMs="15" WaitCount="8772" />
              <Wait WaitType="CXPACKET" WaitTimeMs="1893" WaitCount="3635" />
            </WaitStats>
            <QueryTimeStats CpuTime="2817" ElapsedTime="1868" />
            <RelOp AvgRowSize="1985" EstimateCPU="2E-06" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="20" LogicalOp="Top" NodeId="0" Parallel="false" PhysicalOp="Top" EstimatedTotalSubtreeCost="5.69574">
              <OutputList>
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
              </OutputList>
              <RunTimeInformation>
                <RunTimeCountersPerThread Thread="0" ActualRows="20" Batches="0" ActualEndOfScans="1" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1866" ActualCPUms="0" />
              </RunTimeInformation>
              <Top RowCount="false" IsPercent="false" WithTies="false">
                <TopExpression>
                  <ScalarOperator ScalarString="(20)">
                    <Const ConstValue="(20)" />
                  </ScalarOperator>
                </TopExpression>
                <RelOp AvgRowSize="1993" EstimateCPU="0.0305018" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="20" EstimateRowsWithoutRowGoal="26697" LogicalOp="Gather Streams" NodeId="1" Parallel="true" PhysicalOp="Parallelism" EstimatedTotalSubtreeCost="5.69574">
                  <OutputList>
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                    <ColumnReference Column="Expr1001" />
                  </OutputList>
                  <RunTimeInformation>
                    <RunTimeCountersPerThread Thread="0" ActualRows="20" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1866" ActualCPUms="0" />
                  </RunTimeInformation>
                  <Parallelism>
                    <OrderBy>
                      <OrderByColumn Ascending="true">
                        <ColumnReference Column="Expr1001" />
                      </OrderByColumn>
                    </OrderBy>
                    <RelOp AvgRowSize="1993" EstimateCPU="0.0213576" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="20" EstimateRowsWithoutRowGoal="26697" LogicalOp="Filter" NodeId="2" Parallel="true" PhysicalOp="Filter" EstimatedTotalSubtreeCost="5.66524">
                      <OutputList>
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                        <ColumnReference Column="Expr1001" />
                      </OutputList>
                      <RunTimeInformation>
                        <RunTimeCountersPerThread Thread="2" ActualRows="20" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1229" ActualCPUms="73" />
                        <RunTimeCountersPerThread Thread="1" ActualRows="20" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1228" ActualCPUms="38" />
                        <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="636" ActualCPUms="0" />
                      </RunTimeInformation>
                      <Filter StartupExpression="false">
                        <RelOp AvgRowSize="1993" EstimateCPU="0.0405435" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="66.6667" EstimateRowsWithoutRowGoal="88990" LogicalOp="Distribute Streams" NodeId="3" Parallel="true" PhysicalOp="Parallelism" EstimatedTotalSubtreeCost="5.66522">
                          <OutputList>
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                            <ColumnReference Column="Expr1001" />
                          </OutputList>
                          <RunTimeInformation>
                            <RunTimeCountersPerThread Thread="2" ActualRows="44480" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1215" ActualCPUms="59" />
                            <RunTimeCountersPerThread Thread="1" ActualRows="44480" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="1224" ActualCPUms="33" />
                            <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="636" ActualCPUms="0" />
                          </RunTimeInformation>
                          <Parallelism PartitioningType="RoundRobin">
                            <RelOp AvgRowSize="1993" EstimateCPU="0.0071192" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="66.6667" EstimateRowsWithoutRowGoal="88990" LogicalOp="Compute Scalar" NodeId="4" Parallel="false" PhysicalOp="Sequence Project" EstimatedTotalSubtreeCost="5.62468">
                              <OutputList>
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                <ColumnReference Column="Expr1001" />
                              </OutputList>
                              <RunTimeInformation>
                                <RunTimeCountersPerThread Thread="1" ActualRows="88962" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="623" ActualCPUms="178" />
                                <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="636" ActualCPUms="0" />
                              </RunTimeInformation>
                              <SequenceProject>
                                <DefinedValues>
                                  <DefinedValue>
                                    <ColumnReference Column="Expr1001" />
                                    <ScalarOperator ScalarString="row_number">
                                      <Sequence FunctionName="row_number" />
                                    </ScalarOperator>
                                  </DefinedValue>
                                </DefinedValues>
                                <RelOp AvgRowSize="1993" EstimateCPU="0.0017798" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="66.6667" EstimateRowsWithoutRowGoal="88990" LogicalOp="Segment" NodeId="5" Parallel="false" PhysicalOp="Segment" EstimatedTotalSubtreeCost="5.62467">
                                  <OutputList>
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                    <ColumnReference Column="Segment1002" />
                                  </OutputList>
                                  <RunTimeInformation>
                                    <RunTimeCountersPerThread Thread="1" ActualRows="88962" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="594" ActualCPUms="149" />
                                    <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="636" ActualCPUms="0" />
                                  </RunTimeInformation>
                                  <Segment>
                                    <GroupBy />
                                    <SegmentColumn>
                                      <ColumnReference Column="Segment1002" />
                                    </SegmentColumn>
                                    <RelOp AvgRowSize="1985" EstimateCPU="0.0349153" EstimateIO="0" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="66.6667" EstimateRowsWithoutRowGoal="88990" LogicalOp="Gather Streams" NodeId="6" Parallel="true" PhysicalOp="Parallelism" EstimatedTotalSubtreeCost="5.62467">
                                      <OutputList>
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                        <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                      </OutputList>
                                      <RunTimeInformation>
                                        <RunTimeCountersPerThread Thread="1" ActualRows="88962" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="582" ActualCPUms="137" />
                                        <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="636" ActualCPUms="0" />
                                      </RunTimeInformation>
                                      <Parallelism>
                                        <OrderBy>
                                          <OrderByColumn Ascending="true">
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                          </OrderByColumn>
                                        </OrderBy>
                                        <RelOp AvgRowSize="1985" EstimateCPU="3.3579" EstimateIO="0.00563063" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="66.6667" EstimateRowsWithoutRowGoal="88990" LogicalOp="Sort" NodeId="7" Parallel="true" PhysicalOp="Sort" EstimatedTotalSubtreeCost="5.58976">
                                          <OutputList>
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                            <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                          </OutputList>
                                          <MemoryFractions Input="1" Output="1" />
                                          <RunTimeInformation>
                                            <RunTimeCountersPerThread Thread="2" ActualRebinds="1" ActualRewinds="0" ActualRows="44825" Batches="0" ActualEndOfScans="0" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="750" ActualCPUms="745" ActualScans="0" ActualLogicalReads="0" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" InputMemoryGrant="110520" OutputMemoryGrant="110136" UsedMemoryGrant="35128" />
                                            <RunTimeCountersPerThread Thread="1" ActualRebinds="1" ActualRewinds="0" ActualRows="44165" Batches="0" ActualEndOfScans="1" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="744" ActualCPUms="740" ActualScans="0" ActualLogicalReads="0" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" InputMemoryGrant="110520" OutputMemoryGrant="110136" UsedMemoryGrant="34600" />
                                            <RunTimeCountersPerThread Thread="0" ActualRebinds="0" ActualRewinds="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="0" ActualCPUms="0" ActualScans="0" ActualLogicalReads="0" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" InputMemoryGrant="0" OutputMemoryGrant="0" UsedMemoryGrant="0" />
                                          </RunTimeInformation>
                                          <Sort Distinct="false">
                                            <OrderBy>
                                              <OrderByColumn Ascending="true">
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                              </OrderByColumn>
                                            </OrderBy>
                                            <RelOp AvgRowSize="1985" EstimateCPU="0.049023" EstimateIO="2.1772" EstimateRebinds="0" EstimateRewinds="0" EstimatedExecutionMode="Row" EstimateRows="88990" EstimatedRowsRead="88990" LogicalOp="Clustered Index Scan" NodeId="8" Parallel="true" PhysicalOp="Clustered Index Scan" EstimatedTotalSubtreeCost="2.22622" TableCardinality="88990">
                                              <OutputList>
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                                <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                              </OutputList>
                                              <RunTimeInformation>
                                                <RunTimeCountersPerThread Thread="2" ActualRows="44825" ActualRowsRead="44825" Batches="0" ActualEndOfScans="1" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="381" ActualCPUms="380" ActualScans="1" ActualLogicalReads="1559" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" />
                                                <RunTimeCountersPerThread Thread="1" ActualRows="44165" ActualRowsRead="44165" Batches="0" ActualEndOfScans="1" ActualExecutions="1" ActualExecutionMode="Row" ActualElapsedms="374" ActualCPUms="374" ActualScans="1" ActualLogicalReads="1517" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" />
                                                <RunTimeCountersPerThread Thread="0" ActualRows="0" Batches="0" ActualEndOfScans="0" ActualExecutions="0" ActualExecutionMode="Row" ActualElapsedms="0" ActualCPUms="0" ActualScans="1" ActualLogicalReads="21" ActualPhysicalReads="0" ActualReadAheads="0" ActualLobLogicalReads="0" ActualLobPhysicalReads="0" ActualLobReadAheads="0" />
                                              </RunTimeInformation>
                                              <IndexScan Ordered="false" ForcedIndex="false" ForceScan="false" NoExpandHint="false" Storage="RowStore">
                                                <DefinedValues>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Id" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorProfile" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Recovery" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralNbr" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorNbr" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CdsTissueNbr" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="UnosNbr" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralSource" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralType" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferralStatus" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSharedCase" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameFirst" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameLast" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DateOfBirth" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Age" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Gender" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Race" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorWeight" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeath" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TimeOfDeathType" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganization" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalPhone" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CauseOfDeathPrelim" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CircumstanceOfDeath" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="EyeHourMark" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueHourMark" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsent" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="MedicalExaminerCase" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeName" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomePhone" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContacted" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FuneralHomeContactDate" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimary" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondary" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyes" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitablePoles" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableBone" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinFull" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableHV" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSV" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableFV" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableAI" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSternumCostalCartilage" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableEyeResearch" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther1" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther2" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOther3" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther1Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther2Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOther3Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch1" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch2" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableOtherResearch3" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch1Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch2Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="SuitableOtherResearch3Description" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEye" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeEyeReason" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissue" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="OutcomeTissueReason" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsActive" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedBy" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CreatedDate" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedBy" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ModifiedDate" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="TissueReceipt" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Coordinator" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsSuitableSkinSplit" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DonorRelease" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinPrimaryDesiresCorrespondence" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="NextOfKinSecondaryDesiresCorrespondence" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="HospitalUnit" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ImportedContact" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="AuthorizedContact" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Version" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="Procurement" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameMiddleInitial" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="PatientNameSuffix" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="ReferringOrganizationExtension" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FirstPersonConsentType" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsResearchAuthorized" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CurrentActionItem" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="DiscardReason" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="FollowUpDate" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="IsTissuePending" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="LegacyDonorNbr" />
                                                  </DefinedValue>
                                                  <DefinedValue>
                                                    <ColumnReference Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Alias="[referral0_]" Column="CoordinatorIsWorking" />
                                                  </DefinedValue>
                                                </DefinedValues>
                                                <Object Database="[NCEB_DMS]" Schema="[dbo]" Table="[Referral]" Index="[PK__Referral__3214EC07159CA940]" Alias="[referral0_]" IndexKind="Clustered" Storage="RowStore" />
                                              </IndexScan>
                                            </RelOp>
                                          </Sort>
                                        </RelOp>
                                      </Parallelism>
                                    </RelOp>
                                  </Segment>
                                </RelOp>
                              </SequenceProject>
                            </RelOp>
                          </Parallelism>
                        </RelOp>
                        <Predicate>
                          <ScalarOperator ScalarString="[Expr1001]&gt;(88920)">
                            <Compare CompareOp="GT">
                              <ScalarOperator>
                                <Identifier>
                                  <ColumnReference Column="Expr1001" />
                                </Identifier>
                              </ScalarOperator>
                              <ScalarOperator>
                                <Const ConstValue="(88920)" />
                              </ScalarOperator>
                            </Compare>
                          </ScalarOperator>
                        </Predicate>
                      </Filter>
                    </RelOp>
                  </Parallelism>
                </RelOp>
              </Top>
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>