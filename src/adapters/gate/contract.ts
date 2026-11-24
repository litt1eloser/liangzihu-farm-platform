export interface GateContract {
  version:string;reference:string;verified:boolean;synthetic:boolean;sourceId:string;
  topicPrefix:string;subscribeTopic?:string;downTopicPrefix?:string;directionKey:string;expectedDirection:string;
  wrapperKey:string;rowsKey:string;nameKey:string;valueKey:string;errorKey:string;
  sampledAtKeys:string[];identityKeys:string[];
  metrics:{sourceName:string;metric:string;sourceUnit:string;unit:string;scale:number;offset:number}[];
  mappings:{externalDeviceId:string;metric:string;pointId:string;bindingId?:string}[];
}
