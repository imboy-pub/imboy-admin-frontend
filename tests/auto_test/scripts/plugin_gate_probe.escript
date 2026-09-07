#!/usr/bin/env escript
%%% 插件生命周期复验辅助探针（批次W2R2 引入）。
%%% 前置：imboy@127.0.0.1 已启动，cookie=imboy（同 scripts/imboy_ctl）。
%%%
%%% 用法：
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript gate          # 查门禁
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript gate-on       # 开门禁
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript gate-off      # 关门禁（测完恢复）
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript list          # 列插件与状态
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript state <name>  # 查单插件状态
%%%   escript tests/auto_test/scripts/plugin_gate_probe.escript fail <name>   # 注入失败→failed 态
%%%
%%% fail 走 gen_statem:cast({inject_failure, ...})（imboy_plugin_lifecycle 任意态→failed），
%%% 仅用于本地测试环境给测试插件造 failed 态，复验重置/强制卸载入口。
-mode(compile).
-import(io, [format/2]).

-define(NODE, 'imboy@127.0.0.1').
-define(COOKIE, imboy).

main(Args) ->
    SelfNode = list_to_atom("ctl_w2r2_" ++ integer_to_list(erlang:unique_integer([positive])) ++ "@127.0.0.1"),
    {ok, _} = net_kernel:start([SelfNode, longnames]),
    erlang:set_cookie(node(), ?COOKIE),
    case net_adm:ping(?NODE) of
        pong -> ok;
        pang -> format("ERROR: cannot reach ~p~n", [?NODE]), halt(1)
    end,
    dispatch(Args).

dispatch(["gate"]) ->
    format("gate=~p~n", [rpc:call(?NODE, application, get_env, [imboy, plugin_lifecycle_enabled])]);
dispatch(["gate-on"]) ->
    ok = rpc:call(?NODE, application, set_env, [imboy, plugin_lifecycle_enabled, true]),
    dispatch(["gate"]);
dispatch(["gate-off"]) ->
    ok = rpc:call(?NODE, application, unset_env, [imboy, plugin_lifecycle_enabled]),
    dispatch(["gate"]);
dispatch(["list"]) ->
    case rpc:call(?NODE, imboy_plugin_manager, list_plugins, []) of
        {ok, Items} ->
            [format("~p state=~p~n", [maps:get(name, I), maps:get(state, I, unknown)]) || I <- Items];
        Other -> format("list=~p~n", [Other])
    end;
dispatch(["state", Name]) ->
    format("state=~p~n", [rpc:call(?NODE, imboy_plugin_manager, state, [list_to_atom(Name)])]);
dispatch(["fail", Name]) ->
    case rpc:call(?NODE, imboy_plugin_manager, find_lifecycle, [list_to_atom(Name)]) of
        {badrpc, R} -> format("badrpc=~p~n", [R]), halt(1);
        undefined -> format("no_lifecycle~n", []), halt(1);
        Pid when is_pid(Pid) ->
            ok = rpc:call(?NODE, gen_statem, cast, [Pid, {inject_failure, w2r2_verify_failure}]),
            format("injected to ~p~n", [Pid])
    end;
%% 清理残留 lifecycle（测试失败退出后可能留在任意态）：
%% inject_failure → failed → force_uninstall(hard) → 进程停止 → 回 manifest installed
dispatch(["cleanup", Name]) ->
    N = list_to_atom(Name),
    case rpc:call(?NODE, imboy_plugin_manager, find_lifecycle, [N]) of
        undefined -> format("~p no_lifecycle~n", [N]);
        {badrpc, R} -> format("badrpc=~p~n", [R]), halt(1);
        Pid when is_pid(Pid) ->
            ok = rpc:call(?NODE, gen_statem, cast, [Pid, {inject_failure, w2r2_cleanup}]),
            timer:sleep(200),
            R = rpc:call(?NODE, imboy_plugin_manager, force_uninstall, [N, hard]),
            format("cleanup ~p => ~p~n", [N, R])
    end;
dispatch(Other) ->
    format("unknown args: ~p~n", [Other]), halt(1).
