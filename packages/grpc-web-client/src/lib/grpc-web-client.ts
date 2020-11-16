import { Inject, Injectable, Optional } from '@angular/core';
import { GrpcClient, GrpcClientFactory, GrpcClientSettings, GrpcDataEvent, GrpcEvent, GrpcMessage, GrpcMessageClass, GrpcStatusEvent } from '@ngx-grpc/common';
import { AbstractClientBase, GrpcWebClientBase, Metadata } from 'grpc-web';
import { Observable } from 'rxjs';
import { GRPC_WEB_CLIENT_DEFAULT_SETTINGS } from './tokens';

/**
 * GrpcClientFactory implementation based on grpc-web
 */
@Injectable({
  providedIn: 'root'
})
export class GrpcWebClientFactory implements GrpcClientFactory {

  constructor(
    @Optional() @Inject(GRPC_WEB_CLIENT_DEFAULT_SETTINGS) private defaultSettings: GrpcClientSettings,
  ) { }

  createClient(serviceId: string, customSettings: GrpcClientSettings) {
    const settings = customSettings || this.defaultSettings;

    if (!settings) {
      throw new Error(`grpc-web client factory: no settings provided for ${serviceId}`);
    }

    return new GrpcWebClient({ ...settings });
  }

}

/**
 * GrpcClient implementation based on grpc-web
 */
export class GrpcWebClient implements GrpcClient {

  private client: GrpcWebClientBase;

  constructor(
    private settings: GrpcClientSettings,
  ) {
    this.client = new GrpcWebClientBase(this.settings);
  }

  unary<Q extends GrpcMessage, S extends GrpcMessage>(
    path: string,
    req: Q,
    metadata: Metadata,
    reqclss: GrpcMessageClass<Q>,
    resclss: GrpcMessageClass<S>,
  ): Observable<GrpcEvent<S>> {
    return new Observable(obs => {
      const stream = this.client.rpcCall(
        this.settings.host + path,
        req,
        metadata || {},
        new AbstractClientBase.MethodInfo(
          resclss,
          (request: Q) => request.serializeBinary(),
          resclss.deserializeBinary
        ),
        (error, data) => {
          if (error) {
            obs.next(new GrpcStatusEvent(error.code, error.message, (error as any).metadata));
            obs.complete();
          } else {
            obs.next(new GrpcDataEvent(data));
          }
        }
      );

      // take only status 0 because unary error already includes non-zero statuses
      stream.on('status', status => status.code === 0 ? obs.next(new GrpcStatusEvent(status.code, status.details, status.metadata)) : null);
      stream.on('end', () => obs.complete());

      return () => stream.cancel();
    });
  }

  serverStream<Q extends GrpcMessage, S extends GrpcMessage>(
    path: string,
    req: Q,
    metadata: Metadata,
    reqclss: GrpcMessageClass<Q>,
    resclss: GrpcMessageClass<S>
  ): Observable<GrpcEvent<S>> {
    return new Observable(obs => {
      const stream = this.client.serverStreaming(
        this.settings.host + path,
        req,
        metadata || {},
        new AbstractClientBase.MethodInfo(resclss, (request: Q) => request.serializeBinary(), resclss.deserializeBinary)
      );

      stream.on('status', status => obs.next(new GrpcStatusEvent(status.code, status.details, status.metadata)));
      stream.on('error', error => {
        obs.next(new GrpcStatusEvent(error.code, error.message, (error as any).metadata));
        obs.complete();
      });
      stream.on('data', data => obs.next(new GrpcDataEvent(data)));
      stream.on('end', () => obs.complete());

      return () => stream.cancel();
    });
  }

}
