# footer-ag

Animated usage-limit bar for Claude Code, in the footer next to the model picker.

- Footer: a gradient bar that shrinks and turns from green to red as the limit runs out, the percent **left**, and the time until reset (`4:36` for hours, `2д` for days on the weekly limit). Below 15% left it pulses red. With no reading yet the bar is grey and the percent is `—`.
- ⓘ: opens a card above the prompt with the 5-hour limit, the weekly limit and this chat's context, in plain words. In a narrow window the three blocks stack. ✕ or «Скрыть» closes it.
- Notifications: a toast when a limit passes 50%, 80% and 95% used, once per level and window, not repeated in every open chat.
- `/limit` switches the bar between the 5-hour and the weekly limit (`/limit 5ч`, `/limit неделя`).

Based on pulse-bar by german-98 (IT-SKP marketplace).

## Install on another computer

From a shell (the repo is private, so git on that computer must be signed in to GitHub):

```
claude plugin marketplace add ALEKSGOOD-lab/futerAG
claude plugin install footer-ag@footer-ag
```

Then fully restart the Claude app so every chat, new and already open, picks it up.

## Update

After changes are pushed here: `claude plugin marketplace update footer-ag`, then restart the app.
