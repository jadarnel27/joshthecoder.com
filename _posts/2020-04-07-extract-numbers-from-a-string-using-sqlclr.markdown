---
layout: post
title:  "Extract Numbers from a String using SQLCLR"
categories: 
tags: 
---

I saw an interesting question from Erik Darling ([b][1] \| [t][2]) on the TopAnswers Q&A platform recently:

[Most Efficient Way To Return Only Numbers From A String][3]

Creating a CLR-based scalar function seemed like a good fit for the task, so I decided to answer, and then share the function here on my blog as well.

## Background Information

The basic problem is this: given a string of arbitrary characters, return a new string containing only numbers.  If there are no numbers, return `NULL`.

One use case for a function like this would be removing special characters from a phone number, although that's not the specific goal of this function.

Doing string manipulation directly in SQL Server using T-SQL is somewhat infamously slow.  This is stated very nicely in Aaron Bertrand's ([b][4] \| [t][5]) blog post [Performance Surprises and Assumptions : STRING_SPLIT()][6] (note he's talking about splitting strings, the **emphasis** is mine to illustrate the broader point):

> Throughout, my conclusion has been: STOP DOING THIS IN T-SQL. **Use CLR** or, better yet, pass structured parameters like DataTables from your application to table-valued parameters (TVPs) in your procedures, **avoiding all the string construction and deconstruction** altogether – **which is really the part of the solution that causes performance problems.**

## The Function

First of all, you can download the code [on my GitHub][7].  The repo includes an assembly that contains just this function, a separate assembly with some alternate versions of the function, and a console application that runs benchmarks on the different versions.  

The benchmarks use a really excellent framework called [BenchmarkDotNet][8] (if you didn't know, writing good microbenchmarks is *really* hard - this makes it much easier).

With that out of the way, here's the function:

    public static class UserDefinedFunctions
    {
        [SqlFunction(
            DataAccess = DataAccessKind.None,
            SystemDataAccess = SystemDataAccessKind.None,
            IsDeterministic = true,
            IsPrecise = true)]
        public static SqlString ExtractNumbers(SqlString input)
        {
            var inner = input.Value;
            var builder = new StringBuilder(inner.Length);
            foreach (var character in inner)
            {
                if (char.IsDigit(character))
                {
                    builder.Append(character);
                }
            }
            var result = builder.ToString();
            return result.Length == 0 ? null : result;
        }
    }

The function can be installed on a SQL Server (that has CLR enabled) with the following script:

    CREATE ASSEMBLY [ExtractNumbers]
    FROM 
    0x4D5A90000300000004000000FFFF0000B80000000000000040000000000000000000000000000000\
    0000000000000000000000000000000000000000800000000E1FBA0E00B409CD21B8014CCD215468\
    69732070726F6772616D2063616E6E6F742062652072756E20696E20444F53206D6F64652E0D0D0A\
    2400000000000000504500004C01030051D5F2A20000000000000000E00022200B013000000C0000\
    00060000000000000E2A000000200000004000000000001000200000000200000400000000000000\
    06000000000000000080000000020000000000000300608500001000001000000000100000100000\
    00000000100000000000000000000000BC2900004F00000000400000B00300000000000000000000\
    0000000000000000006000000C000000242900003800000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000200000080000000000000000000000\
    082000004800000000000000000000002E74657874000000140A000000200000000C000000020000\
    000000000000000000000000200000602E72737263000000B00300000040000000040000000E0000\
    000000000000000000000000400000402E72656C6F6300000C000000006000000002000000120000\
    0000000000000000000000004000004200000000000000000000000000000000F029000000000000\
    4800000002000500B82000006C080000010000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000001330020059000000\
    010000110F00281000000A256F1100000A731200000A0A0C160D2B1F08096F1300000A1304110428\
    1400000A2C090611046F1500000A260917580D09086F1100000A32D8066F1600000A0B076F110000\
    0A2C03072B0114281700000A2A00000042534A4201000100000000000C00000076342E302E333033\
    31390000000005006C0000002C020000237E0000980200003C03000023537472696E677300000000\
    D40500000400000023555300D8050000100000002347554944000000E80500008402000023426C6F\
    620000000000000002000001471502000900000000FA013300160000010000001700000002000000\
    0100000001000000170000000F0000000100000001000000020000000000F7010100000000000600\
    2A019B02060097019B020600490069020F00BB02000006007100110206000D0111020600D9001102\
    06007E01110206004A01110206006301110206008800110206005D007C0206003B007C020600BC00\
    11020600A300BF0106000D030A020A00F80036020A002C0036020A00260036020A00D901CA020600\
    28022E030600E5010A02060023020A02000000000100000000000100010081011000DF0200004100\
    01000100502000000000960051024A00010000000100280309006302010011006302060019006302\
    0A002900630210003100630210003900630210004100630210004900630210005100630210005900\
    63021000610063021500690063021000710063021000790063021000890063020600A100B5012300\
    B100EC012700A90063020100B100F4022B00B90020033000A9001F0035008100E3012300A1001403\
    3B0020007B003C012E000B0051002E0013005A002E001B0079002E00230082002E002B0099002E00\
    330099002E003B0099002E00430082002E004B009F002E00530099002E005B0099002E006300B700\
    2E006B00E1002E007300EE001A00048000000100000000000000000000000000FE02000004000000\
    0000000000000000410016000000000004000000000000000000000041000A000000000000000000\
    003C4D6F64756C653E0053797374656D2E44617461006D73636F726C696200417070656E64005379\
    7374656D446174614163636573734B696E6400477569644174747269627574650044656275676761\
    626C6541747472696275746500436F6D56697369626C6541747472696275746500417373656D626C\
    795469746C6541747472696275746500417373656D626C7954726164656D61726B41747472696275\
    7465005461726765744672616D65776F726B41747472696275746500417373656D626C7946696C65\
    56657273696F6E41747472696275746500417373656D626C79436F6E66696775726174696F6E4174\
    747269627574650053716C46756E6374696F6E41747472696275746500417373656D626C79446573\
    6372697074696F6E41747472696275746500436F6D70696C6174696F6E52656C61786174696F6E73\
    41747472696275746500417373656D626C7950726F6475637441747472696275746500417373656D\
    626C79436F7079726967687441747472696275746500417373656D626C79436F6D70616E79417474\
    7269627574650052756E74696D65436F6D7061746962696C69747941747472696275746500676574\
    5F56616C75650053797374656D2E52756E74696D652E56657273696F6E696E670053716C53747269\
    6E6700546F537472696E67006765745F4C656E67746800457874726163744E756D626572732E646C\
    6C0053797374656D0053797374656D2E5265666C656374696F6E004368617200537472696E674275\
    696C646572004D6963726F736F66742E53716C5365727665722E5365727665720045787472616374\
    4E756D62657273436C72002E63746F720053797374656D2E446961676E6F73746963730053797374\
    656D2E52756E74696D652E496E7465726F7053657276696365730053797374656D2E52756E74696D\
    652E436F6D70696C6572536572766963657300446562756767696E674D6F6465730053797374656D\
    2E446174612E53716C54797065730055736572446566696E656446756E6374696F6E73006765745F\
    436861727300457874726163744E756D62657273004F626A656374006F705F496D706C6963697400\
    4973446967697400696E7075740053797374656D2E5465787400000000000000336FABA0CA4FC946\
    97A185AE543F308B00042001010803200001052001011111042001010E042001010208070512550E\
    0E08030320000E032000080420010308040001020305200112550305000111510E08B77A5C561934\
    E089060001115111510801000800000000001E01000100540216577261704E6F6E45786365707469\
    6F6E5468726F77730108010002000000000016010011436C72457874726163744E756D6265727300\
    0005010000000017010012436F7079726967687420C2A92020323032300000290100246166663830\
    6538352D323762352D343235312D623536372D39353763636662393234633600000C010007312E30\
    2E302E3000004D01001C2E4E45544672616D65776F726B2C56657273696F6E3D76342E372E320100\
    540E144672616D65776F726B446973706C61794E616D65142E4E4554204672616D65776F726B2034\
    2E372E328146010004005455794D6963726F736F66742E53716C5365727665722E5365727665722E\
    446174614163636573734B696E642C2053797374656D2E446174612C2056657273696F6E3D342E30\
    2E302E302C2043756C747572653D6E65757472616C2C205075626C69634B6579546F6B656E3D6237\
    37613563353631393334653038390A446174614163636573730000000054557F4D6963726F736F66\
    742E53716C5365727665722E5365727665722E53797374656D446174614163636573734B696E642C\
    2053797374656D2E446174612C2056657273696F6E3D342E302E302E302C2043756C747572653D6E\
    65757472616C2C205075626C69634B6579546F6B656E3D6237376135633536313933346530383910\
    53797374656D446174614163636573730000000054020F497344657465726D696E69737469630154\
    02094973507265636973650100000000A958ADA20000000002000000600000005C2900005C0B0000\
    00000000000000000000000010000000000000000000000000000000525344533476FEE37E0B184C\
    8DAF20BE451DB46401000000433A5C436F64655C457874726163744E756D62657273436C725C4578\
    74726163744E756D626572735C6F626A5C52656C656173655C457874726163744E756D626572732E\
    70646200E42900000000000000000000FE2900000020000000000000000000000000000000000000\
    00000000F0290000000000000000000000005F436F72446C6C4D61696E006D73636F7265652E646C\
    6C0000000000FF250020001000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000100\
    10000000180000800000000000000000000000000000010001000000300000800000000000000000\
    00000000000001000000000048000000584000005403000000000000000000005403340000005600\
    53005F00560045005200530049004F004E005F0049004E0046004F0000000000BD04EFFE00000100\
    000001000000000000000100000000003F0000000000000004000000020000000000000000000000\
    00000000440000000100560061007200460069006C00650049006E0066006F000000000024000400\
    00005400720061006E0073006C006100740069006F006E00000000000000B004B402000001005300\
    7400720069006E006700460069006C00650049006E0066006F000000900200000100300030003000\
    3000300034006200300000001A000100010043006F006D006D0065006E0074007300000000000000\
    22000100010043006F006D00700061006E0079004E0061006D00650000000000000000004C001200\
    0100460069006C0065004400650073006300720069007000740069006F006E000000000043006C00\
    720045007800740072006100630074004E0075006D00620065007200730000003000080001004600\
    69006C006500560065007200730069006F006E000000000031002E0030002E0030002E0030000000\
    46001300010049006E007400650072006E0061006C004E0061006D00650000004500780074007200\
    6100630074004E0075006D0062006500720073002E0064006C006C00000000004800120001004C00\
    6500670061006C0043006F007000790072006900670068007400000043006F007000790072006900\
    6700680074002000A90020002000320030003200300000002A00010001004C006500670061006C00\
    540072006100640065006D00610072006B00730000000000000000004E00130001004F0072006900\
    670069006E0061006C00460069006C0065006E0061006D0065000000450078007400720061006300\
    74004E0075006D0062006500720073002E0064006C006C0000000000440012000100500072006F00\
    64007500630074004E0061006D0065000000000043006C0072004500780074007200610063007400\
    4E0075006D0062006500720073000000340008000100500072006F00640075006300740056006500\
    7200730069006F006E00000031002E0030002E0030002E0030000000380008000100410073007300\
    65006D0062006C0079002000560065007200730069006F006E00000031002E0030002E0030002E00\
    30000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    0000000000000000002000000C000000103A00000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000\
    00000000000000000000000000000000000000000000000000000000000000000000000000000000
    WITH PERMISSION_SET = SAFE;
    GO

    CREATE FUNCTION dbo.ExtractNumbersClr
    (
        @Input nvarchar(4000)
    )
    RETURNS nvarchar(4000)
    WITH 
        RETURNS NULL ON NULL INPUT
    AS EXTERNAL NAME ExtractNumbers.UserDefinedFunctions.ExtractNumbersClr;
    GO

The above script installs the assembly using the pre-built binary at the time of this writing.  You can download the source code and build the assembly yourself if you'd prefer, then install it with:

    CREATE ASSEMBLY [ExtractNumbers]
    FROM 'C:\Path\To\The\Assembly\ExtractNumbers.dll'
    WITH PERMISSION_SET = SAFE;
    GO

Using a December 2018 version of the Stack Overflow sample database, I ran the "baseline" inline-TVF query and the SQLCLR query to compare them.  I also added in a hinted version of the TVF query so that it would go parallel.

    SELECT u.DisplayName, gn.*
    FROM dbo.Users AS u
    CROSS APPLY dbo.get_numbers(u.DisplayName) AS gn
    WHERE u.DisplayName LIKE N'%[0-9]%';

    SELECT u.DisplayName, gn.*
    FROM dbo.Users AS u
    CROSS APPLY dbo.get_numbers(u.DisplayName) AS gn
    WHERE u.DisplayName LIKE N'%[0-9]%'
    OPTION (USE HINT ('ENABLE_PARALLEL_PLAN_PREFERENCE'));

    SELECT 
        u.DisplayName, 
        dbo.ExtractNumbersClr(u.DisplayName) AS gn
    FROM dbo.Users AS u
    WHERE u.DisplayName LIKE N'%[0-9]%';

And here is the summary of the plans in Plan Explorer:

[![Screenshot of duration and runtime for the three queries in plan explorer][9]][9]

The CLR version, which runs in parallel, completes in about 2 seconds and uses about 10 seconds of CPU.  This is quite an improvement over the serial (19 seconds of duration and CPU) and parallel (6 second duration, 25 seconds of CPU) T-SQL inline TVFs.

## Exploring the .NET Code

The code for this function is very brief, but I thought it would be fun to talk about the performance considerations I took when writing it.

There are three main things I thought about while writing this:

- Use `StringBuilder` to build up the result string (rather than concatenating strings with `+=`)
- Set a reasonable default size for the `StringBuilder` object
- Avoid using the `RegEx` APIs

### Use StringBuilder

One pretty intuitive way to build up the result of this function call would be to do this:

    var result = string.Empty;
    foreach (var character in inner)
    {
        if (char.IsDigit(character))
        {
            result += character;
        }
    }

However, concatenating strings in a tight loop like this is *very* bad for performance.  .NET doesn't "reuse" the string on each iteration - it creates a brand new one, and throws the old one away.  This creates a lot more work for the garbage collector and allocator, and results in a lot of unnecessary CPU usage.

The `StringBuilder` class lets you build up a collection of characters, then stitch them together into a single `string` once you're done.

### Set the Default Size for the StringBuilder

As I alluded to in the previous section, a `StringBuilder` is just an array of characters.  Okay technically that's what a `string` is too.  But with the `StringBuilder` we can set the *size* of the array up front.

The pitfall here is that, if we add more characters than this initial size, we run into similar performance issues as we did with string concatenation: a new array is created, all of the items from the old array are copied into it, and the old array is thrown away.

Thus the ideal `StringBuilder` is not *too* large (we don't want to allocate a bigger array than we need), but also doesn't need to *grow*.  If you have some idea of the maximum or average size of the final string, you can pick a good default.

In this case, based on benchmarks in a few different cases, I chose to set the `StringBuilder` to the length of the input string.  This guarantees the builder won't need to grow (even if the whole string is numbers), at the cost of a slightly larger than necessary array allocation (the string might only be half numbers - or have no numbers at all).

### Avoid the RegEx APIs

With a pattern matching problem like this, it's very tempting to use the .NET `RegEx` API to find all the numbers in the string.

However, `RegEx` is not generally not supposed to be run in a tight loop either - it's not a high performance feature.  Really, this is true of a lot of things related to string reading and manipulation, even in .NET.

Part of the problem in the SQLCLR environment is that we have to construct the RegEx object each time (ideally it could be constructed once and cached).  I wrote a few iterations of a RegEx version of the function, all of which were 5-10 times slower than the final version of the function I used.

### Benchmark Results

I ran benchmarks using 40 character input strings (all numbers, half numbers, and no numbers).  There are various "test functions" that represent different possible implementations:

- **ExtractNumbers:** the final version of the function
- **ExtractNumbersSBLengthOneHalf:** similar to the final version, but sets the size of the `StringBuilder` to one half of the input string size.  This performs slightly better than the final function if fewer than half of the characters in the string are numbers
- **ExtractNumbersSBLength4000:** sets the size of the `StringBuilder` to 4000 (the maximum input string size) regardless of the input string.  All the extra memory allocations and cleanup are detrimental to performance here
- **ExtractNumbersRegEx:** a simple RegEx solution that uses string concatenation
- **ExtractNumbersRegEx_Join:** same as the previous, but uses `string.Join(...)` instead of direct concatenation
- **ExtractNumbersRegEx_SB:** uses `StringBuilder` instead of concatenation.  This is the worst overall, since the `RegEx` call already allocates an array of strings for the results, cause there to be double the array allocations of other solutions

This is the output for the Benchmark results:

|                        Method |                Input |       Mean |    Error |   StdDev |  Gen 0 | Gen 1 | Gen 2 | Allocated |
|------------------------------ |--------------------- |-----------:|---------:|---------:|-------:|------:|------:|----------:|
|                **ExtractNumbers** | **11111(...)11111 [40]** |   **221.1 ns** |  **0.49 ns** |  **0.41 ns** | **0.0458** |     **-** |     **-** |     **216 B** |
| ExtractNumbersSBLengthOneHalf | 11111(...)11111 [40] |   238.6 ns |  0.42 ns |  0.40 ns | 0.0539 |     - |     - |     256 B |
|    ExtractNumbersSBLength4000 | 11111(...)11111 [40] |   727.9 ns |  5.15 ns |  4.81 ns | 1.7233 |     - |     - |    8149 B |
|           ExtractNumbersRegEx | 11111(...)11111 [40] | 1,050.0 ns |  2.04 ns |  1.70 ns | 0.0401 |     - |     - |     192 B |
|      ExtractNumbersRegEx_Join | 11111(...)11111 [40] | 1,079.7 ns |  1.15 ns |  1.08 ns | 0.0610 |     - |     - |     288 B |
|        ExtractNumbersRegEx_SB | 11111(...)11111 [40] | 1,155.0 ns |  1.55 ns |  1.37 ns | 0.0954 |     - |     - |     453 B |
|                **ExtractNumbers** | **11111(...)AAAAA [40]** |   **182.9 ns** |  **0.32 ns** |  **0.29 ns** | **0.0372** |     **-** |     **-** |     **176 B** |
| ExtractNumbersSBLengthOneHalf | 11111(...)AAAAA [40] |   172.8 ns |  0.32 ns |  0.28 ns | 0.0288 |     - |     - |     136 B |
|    ExtractNumbersSBLength4000 | 11111(...)AAAAA [40] |   691.9 ns |  5.64 ns |  4.41 ns | 1.7176 |     - |     - |    8121 B |
|           ExtractNumbersRegEx | 11111(...)AAAAA [40] | 1,479.8 ns |  3.52 ns |  3.12 ns | 0.0935 |     - |     - |     449 B |
|      ExtractNumbersRegEx_Join | 11111(...)AAAAA [40] | 1,512.8 ns |  2.93 ns |  2.45 ns | 0.1068 |     - |     - |     505 B |
|        ExtractNumbersRegEx_SB | 11111(...)AAAAA [40] | 1,588.3 ns |  3.15 ns |  2.63 ns | 0.1316 |     - |     - |     625 B |
|                **ExtractNumbers** | **AAAAA(...)AAAAA [40]** |   **152.0 ns** |  **3.01 ns** |  **4.02 ns** | **0.0253** |     **-** |     **-** |     **120 B** |
| ExtractNumbersSBLengthOneHalf | AAAAA(...)AAAAA [40] |   139.0 ns |  1.83 ns |  1.53 ns | 0.0169 |     - |     - |      80 B |
|    ExtractNumbersSBLength4000 | AAAAA(...)AAAAA [40] |   710.1 ns | 13.11 ns | 22.62 ns | 1.7033 |     - |     - |    8052 B |
|           ExtractNumbersRegEx | AAAAA(...)AAAAA [40] | 1,572.3 ns | 31.08 ns | 30.52 ns | 0.0820 |     - |     - |     393 B |
|      ExtractNumbersRegEx_Join | AAAAA(...)AAAAA [40] | 1,570.5 ns | 20.05 ns | 15.65 ns | 0.0820 |     - |     - |     393 B |
|        ExtractNumbersRegEx_SB | AAAAA(...)AAAAA [40] | 1,593.9 ns |  9.74 ns |  8.14 ns | 0.0916 |     - |     - |     437 B |

## Conclusion

If you need to do string processing in SQL Server, you're likely better off using a custom-built CLR solution than using the built-in functions in T-SQL.  However, CLR is not a silver bullet - it's just as easy to write slow C# code as it is to write slow T-SQL.  Always to try different approaches and test the differences.

I could not possibly recommend this book highly enough if you're interested .NET performance tuning: [Writing High-Performance .NET Code][10] by Ben Watson

By the way, if you're not confident you can write a reasonable CLR-based solution to a problem, check out [SQL#][11] ("SQL Sharp") from Solomon Rutzky ([b][12] \| [t][13]).  It's a *massive* library of CLR functions (some free, some paid), and there might be something there that meets your needs.

[1]: https://www.erikdarlingdata.com/blog/
[2]: https://twitter.com/erikdarlingdata
[3]: https://topanswers.xyz/databases?q=846
[4]: https://sqlblog.org/
[5]: https://twitter.com/aaronbertrand
[6]: https://sqlperformance.com/2016/03/sql-server-2016/string-split
[7]: https://github.com/jadarnel27/ExtractNumbersClr
[8]: https://github.com/dotnet/BenchmarkDotNet
[9]: {{ site.url }}/assets/2020-04-07-query-stats.PNG
[10]: https://www.writinghighperf.net/
[11]: https://sqlsharp.com/
[12]: https://sqlquantumleap.com/
[13]: https://twitter.com/SqlQuantumLeap