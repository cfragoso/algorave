"""Master mixer navigation and acknowledged controls; EQ uses the app's native dB scale."""
import math
from typing import Any, Dict, List, Union
from maltego.server import MaltegoContext, MaltegoException, TransformSetting, register_transform
from client import AlgoraveClient
from entities import Engine, Mixer, MixerChannel
from transforms import SET, put, refresh_input, refresh_engine, watch_input

MixerInput = Union[Mixer, MixerChannel]
VOLUME = TransformSetting(name='volume', display_name='Volume (0–100)', type=TransformSetting.Types.int,
                          optional=False, popup=True, default_value=80)
EQ = TransformSetting(name='db', display_name='EQ gain (−24 to +12 dB; 0 is neutral)',
                      type=TransformSetting.Types.float, optional=False, popup=True, default_value=0.0)


def mixer_entity(url, state):
    return put(Mixer('Mixer'), identity=url + '/mixer', label='Mixer', engine_url=url,
               master=state['master'], crossfader=state['crossfader'])


def channel_entity(url, state, deck):
    return put(MixerChannel('Channel ' + deck), identity=url + '/mixer/channels/' + deck,
               label='Channel ' + deck, engine_url=url, deck=deck, master=state['master'],
               crossfader=state['crossfader'], **state['channels'][deck])


def number(settings, key, minimum, maximum, whole=False):
    value = settings.get(key)
    try:
        if value is None or isinstance(value, bool):
            raise ValueError()
        result = float(value)
        if not math.isfinite(result) or not minimum <= result <= maximum or (whole and not result.is_integer()):
            raise ValueError()
        return result
    except (TypeError, ValueError):
        raise MaltegoException(f'Enter {key} from {minimum} to {maximum}' + (' as a whole number.' if whole else '.')) from None


async def apply(entity, patch):
    if isinstance(entity, MixerChannel) and entity.deck not in ('A', 'B'):
        raise MaltegoException('Mixer channel must be A or B. Extract fresh channels.')
    async with AlgoraveClient(entity.engine_url) as api:
        await api.write('/api/mixer', patch)
        state = await api.request('GET', '/api/mixer')
        fresh = channel_entity(api.url, state, entity.deck) if isinstance(entity, MixerChannel) else mixer_entity(api.url, state)
        return refresh_input(entity, fresh)


@register_transform(display_name='To Mixer [Algorave]', transform_set=SET)
async def to_mixer(input_entity: Engine, context: MaltegoContext) -> Mixer:
    async with AlgoraveClient(input_entity.engine_url) as api:
        session = await api.request('GET', '/api/session/state')
        watch_input(input_entity, context)
        refresh_engine(input_entity, session, api.url)
        return mixer_entity(api.url, session['mixer'])


@register_transform(display_name='To Channels [Algorave]', transform_set=SET)
async def to_channels(input_entity: Mixer) -> List[MixerChannel]:
    async with AlgoraveClient(input_entity.engine_url) as api:
        state = await api.request('GET', '/api/mixer')
        return [channel_entity(api.url, state, deck) for deck in ('A', 'B')]


@register_transform(display_name='Crossfader [Algorave]', transform_set=SET,
                    settings=[TransformSetting(name='position', display_name='Crossfader (left / middle / right)',
                    type=TransformSetting.Types.str, popup=True, optional=False, default_value='middle')])
async def crossfader(input_entity: MixerInput, settings: Dict[str, Any]) -> MixerInput:
    position = str(settings.get('position', '')).strip().lower()
    if position not in ('left', 'middle', 'right'):
        raise MaltegoException('Use left (A), middle (A + B), or right (B).')
    return await apply(input_entity, {'crossfader': {'left': 0, 'middle': .5, 'right': 1}[position]})


@register_transform(display_name='Change Channel Volume [Algorave]', transform_set=SET, settings=[VOLUME])
async def channel_volume(input_entity: MixerChannel, settings: Dict[str, Any]) -> MixerChannel:
    volume = number(settings, 'volume', 0, 100, whole=True) / 100
    return await apply(input_entity, {'channels': {input_entity.deck: {'volume': volume}}})


@register_transform(display_name='Change Master Volume [Algorave]', transform_set=SET, settings=[VOLUME])
async def master_volume(input_entity: MixerInput, settings: Dict[str, Any]) -> MixerInput:
    return await apply(input_entity, {'master': number(settings, 'volume', 0, 100, whole=True) / 100})


async def eq(entity, settings, band):
    gain = number(settings, 'db', -24, 12)
    return await apply(entity, {'channels': {entity.deck: {band: gain}}})


@register_transform(display_name='Change High EQ [Algorave]', transform_set=SET, settings=[EQ])
async def high_eq(input_entity: MixerChannel, settings: Dict[str, Any]) -> MixerChannel:
    return await eq(input_entity, settings, 'high')


@register_transform(display_name='Change Mid EQ [Algorave]', transform_set=SET, settings=[EQ])
async def mid_eq(input_entity: MixerChannel, settings: Dict[str, Any]) -> MixerChannel:
    return await eq(input_entity, settings, 'mid')


@register_transform(display_name='Change Low EQ [Algorave]', transform_set=SET, settings=[EQ])
async def low_eq(input_entity: MixerChannel, settings: Dict[str, Any]) -> MixerChannel:
    return await eq(input_entity, settings, 'low')
