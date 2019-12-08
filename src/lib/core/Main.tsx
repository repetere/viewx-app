// eslint-disable-next-line
import React, {
  useEffect,
  FunctionComponent,
  useState,
  useMemo,
  Fragment
} from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router-dom";
import {
  VXAFunctionContext,
  VXAFunctions,
  VXAOptions,
  VXADispatchAction,
  appLoadViewParams
} from "../../../types";

// @ts-ignore
import * as JSONX from "jsonx/dist/jsonx.esm";

import { loadTemplates, loadDynamicTemplate, loadRoute, setup } from "../util/props";
import { setBodyPathnameId } from "../util/html";
import { fetchJSON } from "../util/data";

/**
 * bound default vxa functions to the vxafunctioncontext object
 */
export function bindFunctionContext({
  Functions,
  functionContext
}: {
  Functions: VXAFunctions;
  functionContext: VXAFunctionContext;
}): void {
  Functions.fetchJSON = fetchJSON.bind(functionContext);
  Functions.loadUser = Functions.loadUser.bind(functionContext);
  Functions.loginUser = Functions.loginUser.bind(functionContext);
  Functions.getUserProfile = Functions.getUserProfile.bind(functionContext);
  Functions.validateMFA = Functions.validateMFA.bind(functionContext);
  Functions.logoutUser = Functions.logoutUser.bind(functionContext);
}

export default function getMainComponent(
  options: VXAOptions
): FunctionComponent {
  if (!options) throw ReferenceError("invalid VXA Options");
  else if (!options.config) throw ReferenceError("invalid VXA Options");
  const { dispatch, useGlobalState, config, application } = options;
  const { Functions, settings } = config;
  const dispatcher = (action: VXADispatchAction): void => dispatch(action);
  function Main(appProps: any) {
    const [templates] = useGlobalState("templates");
    // const [templates, setTemplates] = useGlobalState("templates");
    const setTemplates = (templates:any):void => dispatch({ type: 'setTemplates', templates });
    const [views] = useGlobalState("views");
    const [user] = useGlobalState("user");
    const [viewdata] = useGlobalState("viewdata");
    const [ui] = useGlobalState("ui");
    // const [ui, setUI] = useGlobalState("ui");
    const setUI = (ui:any):void => dispatch({ type: 'setUI', ui });
    const [state, setState] = useState(application ? application.state : {});
    const { pathname } = appProps.location;
    const props = Object.assign(
      {
        dispatch,
        templates,
        views,
        viewdata,
        ui,
        user,
        setUI,
        setTemplates,
        updateState: (applicationState: any) => setState(applicationState),
        setApplicationState: (applicationState: any) =>
          dispatch({ type: "setApplicationState", state: applicationState })
      },
      appProps
    );
    const functionContext = {
      props,
      state,
      setState,
      settings,
      viewx: { Functions, settings }
    };
    if (settings.debug) {
      window.VXAcontext = functionContext;
    }
    // eslint-disable-line
    const loadView = useMemo(() => {
      return function _loadView({
        layerName,
        view,
        resourceprops,
        pathname
      }: appLoadViewParams) {
        const loadViewPathname = pathname || `_loadView_${layerName}`;
        return loadRoute({
          ui,
          viewxTemplates: Object.assign({}, templates,
            typeof layerName === 'string'
              ?{
                [layerName]: {
                ...templates[layerName],
                [loadViewPathname]: view
                }
              }
              : {}
          ),
          pathname: loadViewPathname,
          dispatcher,
          layers: layerName
            ? config
              ? config.layers.filter(layer => layer.name === layerName)
              : []
            : config.layers,
          Functions,
          resourceprops,
          functionContext
        });
      };
      /* eslint-disable */
    }, [templates, functionContext]);
    /* eslint-enable */

    Functions.loadView = loadView;
    bindFunctionContext({ Functions, functionContext });

    const getReactElement = JSONX.getReactElement.bind({
      props,
      state,
      setState,
      viewx: { Functions, settings },
      // state:{counter, setCounter},
      debug: settings.debug,
      componentLibraries: Object.assign({}, config.componentLibraries),
      reactComponents: Object.assign({ Link }, config.reactComponents)
    });

    useEffect(() => {
      Functions.onLaunch.call(functionContext);
      return () => Functions.onShutdown.call(functionContext);
      /* eslint-disable */
    }, []);
    /* eslint-enable */
    useEffect(() => {
      let viewxTemplates = templates;
      let action: VXADispatchAction;
      async function initialize() {
        Functions.showLoader.call(functionContext, { ui, setUI });
        try {
          setup.call(functionContext, { settings });
          let updatedUI = ui;
          if (ui.hasLoadedInitialProcess === false) {
            await Functions.loadUser.call(functionContext);
            const updatedTemplates = await loadTemplates({
              config,
              viewxTemplates,
              templates,
              setTemplates,
              setUI,
              ui,
              layers: config.layers,
              Functions,
              functionContext
            });
            viewxTemplates = updatedTemplates.viewxTemplates;
            updatedUI = updatedTemplates.updatedUI;
          }
          if (config.settings.dynamicTemplatePath && updatedUI.templatePaths.includes(pathname) === false) {
            const dynamicTemplates = await loadDynamicTemplate({
              config,
              viewxTemplates,
              templates,
              setTemplates,
              setUI,
              ui,
              layers: config.layers,
              Functions,
              functionContext,
              pathname,
            });

            viewxTemplates = dynamicTemplates.viewxTemplates;
            updatedUI = dynamicTemplates.updatedUI;
          }

          action = await loadRoute({
            ui:updatedUI,
            viewxTemplates,
            pathname,
            dispatcher,
            layers: config.layers,
            Functions,
            functionContext
          });
          if (settings.setBodyPathnameID) setBodyPathnameId(pathname);
        } catch (e) {
          try {
            loadView({
              resourceprops: { error: e },
              pathname: (e.message.includes('Could not load:'))?'__error_400':'__error_500',
            });
          } catch (e) {
          }
          Functions.log({ type: "error", error: e });
        }
        Functions.hideLoader.call(functionContext, { ui: typeof action!=='undefined' && action.ui? action.ui:ui, setUI });
      }
      initialize();
      //   // return function cleanup(){}
      /* eslint-disable */
    }, [pathname /* templates*/]);
    /* eslint-enable */
    return (
      <Fragment>
        {config.layers.map(layer => {
          const { name, type } = layer;
          const jsonxChildren = getReactElement(
            views[name] ? views[name].jsonx : null,
            viewdata[name] ? viewdata[name] : {}
          );
          // console.log(
          //   "LAYER",
          //   { name, type, jsonxChildren },
          //   "views[name]",
          //   views[name],
          //   "viewdata[name]",
          //   viewdata[name]
          // );
          if (type === "applicationRoot") {
            return jsonxChildren;
          } else {
            const el = document.querySelector(`#${name}`);
            return el ? ReactDOM.createPortal(jsonxChildren, el) : null;
          }
        })}
      </Fragment>
    );
  }
  return Main;
}
