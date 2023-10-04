# AIGER safety properties

> **Revision 2a.** Version 1.1.0 (2023-10-04)

All files in this repository were designed from scratch and were not derived
from other input formats. Both unsatisfiable and satisfiable instances range
from very simple to difficult. In the case of satisfiable instances, simple
problems correspond to small counterexamples, whereas difficult problems do not
have small (or short) counterexamples. In the case of unsatisfiable instances,
easier problems often have a small state space or simple interpolants, whereas
difficult problems often have a large state space and no simple interpolants.

This repository contains 302 AIGER files that each have a single output bit,
which acts as a bad state detector. In other words, if the safety property
represented by the AIGER file holds, then its output variable is unsatisfiable.
If the safety property does not hold, then the output variable is satisfied by
some input sequence.

Of the 302 provided files, 108 files have an unsatisfiable output variable. The
remaining 194 files have a satisfiable output variable. The last line of each
`.aag` file includes the correct result.

For some parameterized problems, various instances of the same problem with
different parameters are provided. The difficulty of these instances varies
greatly depending on the selected parameters.
