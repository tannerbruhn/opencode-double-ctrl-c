// Double ctrl+c to exit the opencode TUI, the way Claude Code does it.
//
//   ctrl+c with text in the prompt  -> clears the prompt
//   ctrl+c with an empty prompt     -> "ctrl+c again to exit"
//   ctrl+c again within the window  -> exits
//
// https://github.com/tannerbruhn/opencode-double-ctrl-c
//
// Options (tui.json):  ["./tui-plugins/double-ctrl-c.ts", { "window": 1500, "interrupt": false }]
//   window     ms between the two presses (default 1500)
//   interrupt  when true, the first press on an empty prompt stops a running
//              turn instead of arming exit (Claude Code parity; escape does this anyway)
//   key        the key to take over (default "ctrl+c")
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

type Options = { window?: number; interrupt?: boolean; key?: string }

// The focused prompt is an OpenTUI textarea; plainText is its current content.
function promptText(target: unknown): string | undefined {
  const t = target as { plainText?: unknown } | null
  return t && typeof t.plainText === "string" ? t.plainText : undefined
}

function busy(api: Parameters<TuiPlugin>[0]): boolean {
  const route = api.route.current
  if (route.name !== "session") return false
  const id = (route.params as { sessionID?: string } | undefined)?.sessionID
  if (!id) return false
  const status = api.state.session.status(id)
  return !!status && status.type !== "idle"
}

const tui: TuiPlugin = async (api, options) => {
  const opts = (options ?? {}) as Options
  const window = typeof opts.window === "number" && opts.window > 0 ? opts.window : 1500
  const key = typeof opts.key === "string" && opts.key ? opts.key : "ctrl+c"
  let armed = 0

  api.keymap.registerLayer({
    mode: "base",
    // Above the host's app_exit layer so a single press never reaches it.
    priority: 1000,
    commands: [
      {
        name: "double_ctrl_c.press",
        title: "Clear the prompt, or exit on a double press",
        category: "Plugin",
        run(ctx) {
          const text = promptText(ctx.target ?? ctx.focused)
          if (text !== undefined && text.length > 0) {
            armed = 0
            // The host's own clear command resets parts and mode too; fall back
            // to wiping the textarea if it is not resolvable for some reason.
            const result = api.keymap.dispatchCommand("prompt.clear") as { status?: string } | undefined
            if (result?.status && result.status !== "resolved") {
              ;(ctx.target as { setText?: (value: string) => void } | null)?.setText?.("")
            }
            return true
          }
          if (opts.interrupt && busy(api)) {
            armed = 0
            api.keymap.dispatchCommand("session.interrupt")
            return true
          }
          const now = Date.now()
          if (now - armed <= window) {
            armed = 0
            api.keymap.dispatchCommand("app.exit")
            return true
          }
          armed = now
          api.ui.toast({ variant: "info", message: `${key} again to exit`, duration: window })
          return true
        },
      },
    ],
    bindings: [
      {
        key,
        cmd: "double_ctrl_c.press",
        desc: "Clear prompt / double press to exit",
        preventDefault: true,
      },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "double-ctrl-c",
  tui,
}

export default plugin
