# Third-party vocabulary notices

The files under `public/data/vocabulary/` are a transformed vocabulary dataset.
They select and rank English display words, join Chinese meanings and phonetics,
compact the presentation text, and infer parts of speech only where ECDICT
contains an explicit grammatical label. The resulting vocabulary data is
distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
because its frequency ranking is derived from `wordfreq`. Application source
code is licensed separately.

## wordfreq

- Project: `wordfreq` 3.1.1
- Author: Robyn Speer
- Upstream: <https://github.com/rspeer/wordfreq>
- Code license: Apache License 2.0
- Included data license: Creative Commons Attribution-ShareAlike 4.0
- Pinned distribution SHA-256:
  `4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473`

The generated vocabulary retains `wordfreq`'s version and attribution in its
manifest and in every shard. `wordfreq` combines frequency observations from
multiple domains and sources, including Wikipedia, Google Books Ngrams, Leeds
Internet Corpus, ParaCrawl, News Crawl, Global Voices, OSCAR, OPUS
OpenSubtitles/OpenSubtitles, SUBTLEX-US, SUBTLEX-UK, Twitter-derived frequency
statistics, and Reddit-derived frequency statistics. See the upstream project
for its complete source citations and notices.

In particular, SUBTLEX-derived data must credit its authors. The English source
citations include Marc Brysbaert and Boris New, *Moving beyond Kučera and
Francis: A critical evaluation of current word frequency norms and the
introduction of a new and improved word frequency measure for American
English* (2009), and Walter J. B. van Heuven, Pawel Mandera, Emmanuel Keuleers,
and Marc Brysbaert, *SUBTLEX-UK: A new and improved word frequency database for
British English* (2014). OpenSubtitles-derived data is attributed to the
OpenSubtitles project.

The Apache-2.0 notice supplied by `wordfreq` states:

> Copyright 2022 Robyn Speer
>
> Licensed under the Apache License, Version 2.0. You may obtain a copy at
> <http://www.apache.org/licenses/LICENSE-2.0>.

## ECDICT

- Project: ECDICT
- Commit: `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- Author/copyright holder: Linwei
- Upstream: <https://github.com/skywind3000/ECDICT>
- License: MIT
- Pinned `ecdict.csv` SHA-256:
  `1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`

MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Princeton WordNet

- Project: Princeton WordNet 3.0
- Upstream: <https://wordnet.princeton.edu/>
- Pinned archive SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- License: Princeton WordNet License

WordNet lexical categories, synsets and lemma relations are used to organize
the derived semantic universe. The complete upstream license text is shipped
at `public/data/semantic/WORDNET-LICENSE.txt`.
