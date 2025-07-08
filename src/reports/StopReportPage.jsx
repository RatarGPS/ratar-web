import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  IconButton,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';
import {
  formatDistance, formatVolume, formatTime, formatNumericHours,
} from '../common/util/formatter';
import ReportFilter from './components/ReportFilter';
import { useAttributePreference } from '../common/util/preferences';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import ColumnSelect from './components/ColumnSelect';
import usePersistedState from '../common/util/usePersistedState';
import { useCatch } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import MapPositions from '../map/MapPositions';
import MapView from '../map/core/MapView';
import MapCamera from '../map/MapCamera';
import AddressValue from '../common/components/AddressValue';
import TableShimmer from '../common/components/TableShimmer';
import MapGeofence from '../map/MapGeofence';
import scheduleReport from './common/scheduleReport';
import MapScale from '../map/MapScale';

const columnsArray = [
  ['startTime', 'reportStartTime'],
  ['startOdometer', 'positionOdometer'],
  ['address', 'positionAddress'],
  ['endTime', 'reportEndTime'],
  ['duration', 'reportDuration'],
  ['engineHours', 'reportEngineHours'],
  ['spentFuel', 'reportSpentFuel'],
];
const columnsMap = new Map(columnsArray);

const StopReportPage = () => {
  const navigate = useNavigate();
  const { classes } = useReportStyles();
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);

  const distanceUnit = useAttributePreference('distanceUnit');
  const volumeUnit = useAttributePreference('volumeUnit');

  const [columns, setColumns] = usePersistedState('stopColumns', ['startTime', 'endTime', 'startOdometer', 'address']);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [flexBasis, setFlexBasis] = useState('65%');
  const containerMapRef = useRef(null);

  const handleSubmit = useCatch(async ({ deviceIds, groupIds, from, to, type }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    if (type === 'export') {
      window.location.assign(`/api/reports/stops/xlsx?${query.toString()}`);
    } else if (type === 'mail') {
      const response = await fetch(`/api/reports/stops/mail?${query.toString()}`);
      if (!response.ok) {
        throw Error(await response.text());
      }
    } else {
      setLoading(true);
      try {
        const response = await fetch(`/api/reports/stops?${query.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          setItems(await response.json());
        } else {
          throw Error(await response.text());
        }
      } finally {
        setLoading(false);
      }
    }
  });

  const handleSchedule = useCatch(async (deviceIds, groupIds, report) => {
    report.type = 'stops';
    const error = await scheduleReport(deviceIds, groupIds, report);
    if (error) {
      throw Error(error);
    } else {
      navigate('/reports/scheduled');
    }
  });

  const formatValue = (item, key) => {
    const value = item[key];
    switch (key) {
      case 'deviceId':
        return devices[value].name;
      case 'startTime':
      case 'endTime':
        return formatTime(value, 'minutes');
      case 'startOdometer':
        return formatDistance(value, distanceUnit, t);
      case 'duration':
        return formatNumericHours(value, t);
      case 'engineHours':
        return value > 0 ? formatNumericHours(value, t) : null;
      case 'spentFuel':
        return value > 0 ? formatVolume(value, volumeUnit, t) : null;
      case 'address':
        return (<AddressValue latitude={item.latitude} longitude={item.longitude} originalAddress={value} />);
      default:
        return value;
    }
  };

  const handleMouseDown = (e) => {
    const startY = e.clientY;
    const startHeight = containerMapRef.current.offsetHeight;

    const handleMouseMove = (event) => {
      const newHeight = startHeight + (event.clientY - startY);
      const newFlexBasis = `${(newHeight / window.innerHeight) * 100}%`;
      setFlexBasis(newFlexBasis);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportStops']}>
      <div className={classes.container}>
        {selectedItem && (
          <div
            ref={containerMapRef}
            className={classes.containerMap}
            style={{ flexBasis, position: 'relative' }}
          >
            <MapView>
              <MapGeofence />
              <MapPositions
                positions={[{
                  deviceId: selectedItem.deviceId,
                  fixTime: selectedItem.startTime,
                  latitude: selectedItem.latitude,
                  longitude: selectedItem.longitude,
                }]}
                titleField="fixTime"
              />
            </MapView>
            <MapScale />
            <MapCamera latitude={selectedItem.latitude} longitude={selectedItem.longitude} />
            <div
              style={{
                height: '5px',
                backgroundColor: 'gray',
                cursor: 'row-resize',
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
              }}
              onMouseDown={handleMouseDown}
            />
          </div>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter handleSubmit={handleSubmit} handleSchedule={handleSchedule} multiDevice includeGroups loading={loading}>
              <ColumnSelect columns={columns} setColumns={setColumns} columnsArray={columnsArray} />
            </ReportFilter>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell className={classes.columnAction} />
                <TableCell>{t('sharedDevice')}</TableCell>
                {columns.map((key) => (<TableCell key={key}>{t(columnsMap.get(key))}</TableCell>))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? items.map((item) => (
                <TableRow key={item.positionId}>
                  <TableCell className={classes.columnAction} padding="none">
                    {selectedItem === item ? (
                      <IconButton size="small" onClick={() => setSelectedItem(null)}>
                        <GpsFixedIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      <IconButton size="small" onClick={() => setSelectedItem(item)}>
                        <LocationSearchingIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                  <TableCell>{devices[item.deviceId].name}</TableCell>
                  {columns.map((key) => (
                    <TableCell key={key}>
                      {formatValue(item, key)}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (<TableShimmer columns={columns.length + 2} startAction />)}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageLayout>
  );
};

export default StopReportPage;
