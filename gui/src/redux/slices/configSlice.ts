import { ConfigResult, ConfigValidationError } from "@continuedev/config-yaml";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { BrowserSerializedContinueConfig } from "core";
import { DEFAULT_CONTEXT_LENGTH } from "core/llm/constants";
import {
  DEFAULT_PERSONAS,
  isDefaultPersona,
} from "../../pages/config/sections/defaultPersonas";
import { Persona } from "../../pages/config/sections/PersonaSection";

export type ConfigState = {
  configError: ConfigValidationError[] | undefined;
  config: BrowserSerializedContinueConfig;
  loading: boolean;
};

export const EMPTY_CONFIG: BrowserSerializedContinueConfig = {
  slashCommands: [],
  contextProviders: [],
  tools: [],
  mcpServerStatuses: [],
  modelsByRole: {
    chat: [],
    apply: [],
    edit: [],
    summarize: [],
    autocomplete: [],
    rerank: [],
    embed: [],
    subagent: [],
  },
  selectedModelByRole: {
    chat: null,
    apply: null,
    edit: null,
    summarize: null,
    autocomplete: null,
    rerank: null,
    embed: null,
    subagent: null,
  },
  rules: [],
};

export const INITIAL_CONFIG_SLICE: ConfigState = {
  configError: undefined,
  config: EMPTY_CONFIG,
  loading: false,
};

export const configSlice = createSlice({
  name: "config",
  initialState: INITIAL_CONFIG_SLICE,
  reducers: {
    setConfigResult: (
      state,
      {
        payload: result,
      }: PayloadAction<ConfigResult<BrowserSerializedContinueConfig>>,
    ) => {
      const { config, errors } = result;
      if (!errors || errors.length === 0) {
        state.configError = undefined;
      } else {
        state.configError = errors;
      }

      // If an error is found in config on save,
      // We must invalidate the GUI config too,
      // Since core won't be able to load config
      // Don't invalidate the loaded config
      if (!config) {
        state.config = EMPTY_CONFIG;
      } else {
        state.config = config;
      }
      state.loading = false;
    },
    updateConfig: (
      state,
      { payload: config }: PayloadAction<BrowserSerializedContinueConfig>,
    ) => {
      state.config = config;
    },
    setConfigLoading: (state, { payload: loading }: PayloadAction<boolean>) => {
      state.loading = loading;
    },
  },
  selectors: {
    selectSelectedChatModelContextLength: (state): number => {
      return (
        state.config.selectedModelByRole.chat?.contextLength ||
        DEFAULT_CONTEXT_LENGTH
      );
    },
    selectSelectedChatModel: (state) => {
      return state.config.selectedModelByRole.chat;
    },
    selectUIConfig: (state) => {
      return state.config?.ui ?? null;
    },
    selectPersonas: (state) => {
      return state.config.personas;
    },
    selectPersonaByName: (state, name: string): Persona | undefined => {
      // Built-in persona, with customInstructions from config if overridden
      if (isDefaultPersona(name)) {
        const defaultPersona = DEFAULT_PERSONAS.find((p) => p.name === name);
        if (defaultPersona) {
          const override = state.config.personas?.find((p) => p.name === name);
          return {
            ...defaultPersona,
            customInstructions: override?.customInstructions || "",
          };
        }
      }
      return state.config.personas?.find((m) => m.name === name);
    },
  },
});

export const { updateConfig, setConfigResult, setConfigLoading } =
  configSlice.actions;

export const {
  selectSelectedChatModelContextLength,
  selectUIConfig,
  selectSelectedChatModel,
  selectPersonas,
  selectPersonaByName,
} = configSlice.selectors;

export default configSlice.reducer;
